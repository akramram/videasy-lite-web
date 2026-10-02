// Continue-watching store (US-1) — localStorage only, no network.
// Contract per KUR-49 reconciliation (binding):
//   key videasy:cw.v1     — in-progress entries (row + resume)
//   key videasy:watched.v1 — finished ids (>=92%, episode list checkmark)
// Thresholds: >=60s watched time to enter the row; >=92% or <60s-to-end moves
// to watched; entries expire after 30 days without progress; row caps at 10,
// most recent first.
//
// Progress source (KUR-49.5 Amendment 1): PLAYER_EVENT postMessage events from
// the player.videasy.net/.to embed are PRIMARY (see cwPlayer.ts); wall-clock
// estimation is only a runtime fallback when no events arrive within ~15s.

export type CwType = "movie" | "tv";

export interface CwEntry {
  /** IMDB id (tt…), canonical key for dedupe + watched set. */
  imdbId: string;
  /** TMDB id used by the embed (tmdb-<n>); for resume deep-links. */
  tmdbId?: string;
  type: CwType;
  title: string;
  season?: number;
  episode?: number;
  episodeTitle?: string;
  /** Runtime in minutes when known (Cinemeta "92 min" parsed at write time). */
  runtimeMin?: number;
  /** Last known position + duration, seconds. From events when available. */
  positionSec?: number;
  durationSec?: number;
  /** Fraction 0..1 — computed on write, drives the row progress bar. */
  progress: number;
  startedAt: number;
  updatedAt: number;
}

const CW_KEY = "videasy:cw.v1";
const WATCHED_KEY = "videasy:watched.v1";
const MAX_ENTRIES = 10;
const EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
/** >=92% counts as finished (design reconciliation, binding). */
export const WATCHED_THRESHOLD = 0.92;

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function loadEntries(): CwEntry[] {
  if (typeof localStorage === "undefined") return [];
  const entries = safeParse<CwEntry[]>(localStorage.getItem(CW_KEY), []);
  if (!Array.isArray(entries)) return [];
  const now = Date.now();
  return entries
    .filter((e) => e && typeof e.imdbId === "string" && now - (e.updatedAt ?? 0) < EXPIRY_MS)
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    .slice(0, MAX_ENTRIES);
}

function saveEntries(entries: CwEntry[]): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(CW_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  window.dispatchEvent(new CustomEvent("videasy:cw-changed"));
}

export function loadWatched(): string[] {
  if (typeof localStorage === "undefined") return [];
  return safeParse<string[]>(localStorage.getItem(WATCHED_KEY), []);
}

function markWatched(imdbId: string): void {
  const watched = loadWatched();
  if (!watched.includes(imdbId)) {
    localStorage.setItem(WATCHED_KEY, JSON.stringify([...watched, imdbId]));
  }
}

/** Clamp + compute progress fraction from position/duration. */
function computeProgress(positionSec: number, durationSec?: number): number {
  if (!durationSec || Number.isNaN(durationSec) || durationSec <= 0) return 0;
  return Math.min(Math.max(positionSec / durationSec, 0), 1);
}

/** Minimum watched seconds before a title enters the row (binding: >=60s). */
export const MIN_WATCHED_SEC = 60;

export interface UpsertInput {
  imdbId: string;
  tmdbId?: string;
  type: CwType;
  title: string;
  season?: number;
  episode?: number;
  episodeTitle?: string;
  runtimeMin?: number;
  positionSec: number;
  durationSec?: number;
  /** True when the source of this update is the embed's own event. */
  fromEvent?: boolean;
}

/**
 * Upsert one progress sample. Returns the stored entry, or null when the
 * sample didn't qualify (too early) or moved to watched.
 */
export function upsertProgress(input: UpsertInput): CwEntry | null {
  const entries = loadEntries();
  const existing = entries.find((e) => e.imdbId === input.imdbId);
  const now = Date.now();
  const duration = input.durationSec && !Number.isNaN(input.durationSec) ? input.durationSec : undefined;
  const position = Math.max(0, input.positionSec || 0);
  const progress = computeProgress(position, duration);

  // >=92% of a known duration => finished: move to watched.v1, drop from row.
  if (duration && progress >= WATCHED_THRESHOLD) {
    saveEntries(entries.filter((e) => e.imdbId !== input.imdbId));
    markWatched(input.imdbId);
    return null;
  }

  const entry: CwEntry = {
    imdbId: input.imdbId,
    tmdbId: input.tmdbId ?? existing?.tmdbId,
    type: input.type,
    title: input.title,
    season: input.season ?? existing?.season,
    episode: input.episode ?? existing?.episode,
    episodeTitle: input.episodeTitle ?? existing?.episodeTitle,
    runtimeMin: input.runtimeMin ?? existing?.runtimeMin,
    positionSec: position,
    durationSec: duration,
    progress,
    startedAt: existing?.startedAt ?? now,
    updatedAt: now,
  };

  const rest = entries.filter((e) => e.imdbId !== input.imdbId);
  saveEntries([entry, ...rest]);
  return entry;
}

export function removeEntry(imdbId: string): void {
  saveEntries(loadEntries().filter((e) => e.imdbId !== imdbId));
}

/** Human sub-line: "S2E4 · Pilot" (series) or "18 min left" (movie). */
export function entrySubline(entry: CwEntry): string {
  if (entry.type === "tv" && entry.season && entry.episode) {
    const prefix = `S${entry.season}E${entry.episode}`;
    return entry.episodeTitle ? `${prefix} · ${entry.episodeTitle}` : prefix;
  }
  const duration = entry.durationSec;
  if (duration && duration > 0) {
    const left = Math.max(0, Math.round((duration - (entry.positionSec ?? 0)) / 60));
    if (left >= 1) return `${left} min left`;
  } else if (entry.runtimeMin) {
    const left = Math.max(0, Math.round(entry.runtimeMin * (1 - entry.progress)));
    if (left >= 1) return `${left} min left`;
  }
  return entry.title;
}

/** Entry key match for event data (type-id + season/episode). */
export function entryKey(type: string, id: string, season?: number, episode?: number): string {
  return type === "tv" ? `${type}-${id}-s${season ?? 1}e${episode ?? 1}` : `${type}-${id}`;
}
