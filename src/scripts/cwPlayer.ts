// PLAYER_EVENT listener (US-1 / KUR-49.5 Amendment 1).
// The videasy embed (player.videasy.net / .to) broadcasts progress to the
// parent via window "message": envelope is a JSON *string*
//   { type: "PLAYER_EVENT", data: { event, ...payload } }
// with TWO payload generations in prod: newer `data.timestamp`, older
// `data.currentTime`. Events: timeupdate / play / pause / ended.
// Broadcast-only — there is no parent→player command API.
//
// Relay mapping (binding, from research (b)):
//   timeupdate → upsert, throttled ~1 write/4s (or >=5s position delta)
//   play       → upsert immediately (state touch)
//   pause      → upsert immediately (flush)
//   ended      → position = duration, then grace-period guard: the player
//                auto-navigates itself to the next episode, so ignore events
//                for that key for 10s to avoid double-fires.
// Key comes from EVENT data (type/id/season/episode), never our iframe src.

import { upsertProgress, markEpisodeWatched, WATCHED_THRESHOLD } from "@/lib/continueWatching";

const ALLOWED_ORIGINS = new Set([
  "https://player.videasy.net",
  "https://player.videasy.to",
]);
const THROTTLE_MS = 4000;
const THROTTLE_DELTA_SEC = 5;
const ENDED_GRACE_MS = 10_000;

interface PlayerEventData {
  event?: string;
  // newer generation
  timestamp?: number;
  duration?: number;
  progress?: number;
  // older generation (8351 chunk)
  currentTime?: number;
  // identity
  type?: string;
  id?: string | number;
  season?: number;
  episode?: number;
}

export interface CwRelayContext {
  /** IMDB id of the title page that mounted the player. */
  imdbId: string;
  /** TMDB id passed to the embed (digits). */
  tmdbId?: string;
  type: "movie" | "tv";
  title: string;
  runtimeMin?: number;
  /** US-4: episodes of the active season, keyed "S{s}E{e}" — episode titles
      + last-episode detection for the next-episode chip. */
  episodes?: { season: number; number: number; name: string }[];
}

/** US-4: one accepted PLAYER_EVENT sample, post-throttle. */
export interface RelaySample {
  season: number;
  episode: number;
  positionSec: number;
  durationSec?: number;
}

/**
 * Subscribe to accepted relay samples (US-4). Returns a detach function.
 *
 * attachCwRelay keeps its listener set per attach instance (function-local
 * state), so a registry here bridges instances: any attached relay fans its
 * accepted samples out to module subscribers. Detach removes the subscription.
 */
const sampleRegistry = new Set<(sample: RelaySample) => void>();

export function attachCwRelaySamples(
  listener: (sample: RelaySample) => void,
): () => void {
  sampleRegistry.add(listener);
  return () => sampleRegistry.delete(listener);
}

function notifySamples(sample: RelaySample): void {
  for (const fn of sampleRegistry) fn(sample);
}

/** Resolved identity of an event, from the event data itself. */
interface Resolved {
  key: string;
  season?: number;
  episode?: number;
  tmdbId: string;
  eventType: "movie" | "tv";
}

function resolveIdentity(data: PlayerEventData, ctx: CwRelayContext): Resolved {
  const rawType = (data.type ?? ctx.type) === "tv" ? "tv" : "movie";
  const rawId = data.id !== undefined ? String(data.id) : (ctx.tmdbId ?? ctx.imdbId);
  // Strip tmdb-/tt- prefixes the player may add; keep bare digits when possible.
  const digits = rawId.replace(/^(tmdb-|tt)/, "");
  const tmdbId = /^\d+$/.test(digits) ? digits : (ctx.tmdbId ?? "");
  const season = data.season;
  const episode = data.episode;
  return {
    key: rawType === "tv" ? `tv-${tmdbId}-s${season ?? "?"}e${episode ?? "?"}` : `movie-${tmdbId}`,
    season,
    episode,
    tmdbId,
    eventType: rawType,
  };
}

/**
 * Attach the global message listener for one mounted player. Season/episode
 * come from the page's embed target (what we asked the player to load); the
 * event's own season/episode win when present. Returns a detach function
 * (called on episode switch / unmount by the caller).
 */
export function attachCwRelay(
  ctx: CwRelayContext,
  targetSeason?: number,
  targetEpisode?: number,
): () => void {
  let lastWriteAt = 0;
  let lastPositionSec = 0;
  const endedAt = new Map<string, number>();

  function onMessage(event: MessageEvent) {
    if (!ALLOWED_ORIGINS.has(event.origin)) return;
    let msg: { type?: string; data?: PlayerEventData };
    try {
      msg = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
    } catch {
      return;
    }
    if (msg?.type !== "PLAYER_EVENT" || !msg.data) return;
    const data = msg.data;
    const kind = data.event;
    if (kind !== "timeupdate" && kind !== "play" && kind !== "pause" && kind !== "ended") {
      return;
    }

    const id = resolveIdentity(data, ctx);
    const now = Date.now();

    // Ended grace: player self-navigates to next episode; drop double-fires.
    const ended = endedAt.get(id.key);
    if (ended && now - ended < ENDED_GRACE_MS) return;

    // Dual-generation position field.
    const positionSec = data.timestamp ?? data.currentTime ?? 0;
    const durationSec = data.duration;

    if (kind === "timeupdate") {
      if (now - lastWriteAt < THROTTLE_MS && Math.abs(positionSec - lastPositionSec) < THROTTLE_DELTA_SEC) {
        return;
      }
    }
    if (kind === "ended") {
      endedAt.set(id.key, now);
    }

    lastWriteAt = now;
    lastPositionSec = positionSec;

    // Season/episode: event data wins; fall back to the embed target we asked
    // for (the page knows best what is playing when events omit identity).
    const season = id.season ?? targetSeason;
    const episode = id.episode ?? targetEpisode;

    // US-4: record which episode produced this sample so the next-episode
    // chip follows the embed even after it self-advances (autoNext).
    if (ctx.type === "tv" && season && episode) {
      notifySamples({ season, episode, positionSec, durationSec });
    }

    // US-4: resolve the episode title from the page's episode list so the CW
    // row keeps its "S2E4 · Mango" subline when events carry only numbers.
    const epMeta = ctx.episodes?.find(
      (e) => e.season === season && e.number === episode,
    );

    upsertProgress({
      imdbId: ctx.imdbId,
      tmdbId: id.tmdbId || undefined,
      type: ctx.type,
      title: ctx.title,
      season: ctx.type === "tv" ? season : undefined,
      episode: ctx.type === "tv" ? episode : undefined,
      episodeTitle: epMeta?.name,
      runtimeMin: ctx.runtimeMin,
      positionSec,
      durationSec,
      fromEvent: true,
    });

    // US-4: episode-keyed watched marking at the finished threshold, so the
    // episode list can show checkmarks (KUR-49.2 §4-C) without touching
    // legacy whole-title entries. Threshold logic lives here because only the
    // relay sees per-episode real progress; next-episode targeting uses the
    // page's episode list, not this store.
    if (ctx.type === "tv" && season && episode) {
      const knownDuration = durationSec ?? (ctx.runtimeMin ? ctx.runtimeMin * 60 : undefined);
      const atThreshold =
        kind === "ended" ||
        (knownDuration && knownDuration > 0
          ? positionSec / knownDuration >= WATCHED_THRESHOLD
          : false);
      if (atThreshold) markEpisodeWatched(ctx.imdbId, season, episode);
    }
  }

  window.addEventListener("message", onMessage);
  return () => window.removeEventListener("message", onMessage);
}
