import { useEffect, useRef, useState } from "react";
import { embedUrl } from "@/lib/videasy";
import type { EmbedTarget, ServerOption } from "@/lib/videasy";
import { attachCwRelay, attachCwRelaySamples } from "@/scripts/cwPlayer";
import { notifyEventSeen } from "@/scripts/cwWallClock";

interface PlayerProps {
  target: EmbedTarget;
  /** Resume start position in seconds (US-1; videasy ?progress= param). */
  startSeconds?: number;
  /** Title for the chrome bar now-playing line (M5). */
  title?: string;
  /** Episode/`movie` label shown next to the title (M5). */
  label?: string;
  /** Continue-watching context; relay attaches only when present (US-1). */
  cw?: {
    imdbId: string;
    tmdbId?: string;
    type: "movie" | "tv";
    title: string;
    runtimeMin?: number;
    /** Parse "92 min" -> 92 once in TitlePage. */
    /** US-4: active-season episode list for the next-episode chip. */
    episodes?: { season: number; number: number; name: string }[];
  };
  /** US-4: start the named next episode (server selection is preserved by
      the parent — Player stays mounted across episode switches). */
  onNextEpisode?: (season: number, episode: number) => void;
}

const SERVERS: readonly ServerOption[] = ["videasy", "vidlink", "vidsrc"];
const SERVER_LABELS: Record<ServerOption, string> = {
  videasy: "Videasy",
  vidlink: "VidLink",
  vidsrc: "Vidsrc",
};
/** US-4: reveal the next-episode chip inside the final 90s of an episode. */
const NEXT_EPISODE_WINDOW_SEC = 90;

/**
 * Embedded player surface (design §4-D, M4/M5):
 * - loading shell: dimmed blurred backdrop + spinner + status line while the
 *   cross-origin iframe loads; iframe fades in on load; >=400ms shell minimum
 *   so the spinner never flashes;
 * - chrome bar under the iframe: now-playing + server switcher (persistent on
 *   touch — never overlays the iframe).
 */
export function Player({ target, startSeconds, title, label, cw, onNextEpisode }: PlayerProps) {
  const [server, setServer] = useState<ServerOption>("videasy");
  // undefined = iframe still loading; true = loaded (faded in).
  const [loaded, setLoaded] = useState<boolean | null>(null);
  const shellStart = useRef<number>(0);
  // US-4: the episode currently producing samples per the relay (event data
  // wins over our embed target). null = unknown / not a series.
  const [activeEp, setActiveEp] = useState<{ season: number; episode: number } | null>(
    target.type === "tv" && target.season && target.episode
      ? { season: target.season, episode: target.episode }
      : null,
  );
  // US-4: last real position/duration seen from PLAYER_EVENT samples.
  const [epProgress, setEpProgress] = useState<{ positionSec: number; durationSec?: number } | null>(
    null,
  );

  // M4: restart the loading shell whenever the embed (server or episode) swaps.
  useEffect(() => {
    setLoaded(null);
    shellStart.current = Date.now();
  }, [server, target.id, target.season, target.episode]);

  // US-4: reset chip state when the requested episode changes (manual switch
  // or parent-driven next-episode).
  useEffect(() => {
    setActiveEp(
      target.type === "tv" && target.season && target.episode
        ? { season: target.season, episode: target.episode }
        : null,
    );
    setEpProgress(null);
  }, [target.type, target.id, target.season, target.episode]);

  // US-1: attach the PLAYER_EVENT relay for as long as this player + episode
  // is active. Keyed on identity so an episode switch re-attaches cleanly.
  // Every accepted event also notifies the wall-clock fallback (it stands
  // down while real events flow).
  useEffect(() => {
    if (!cw) return;
    notifyEventSeen(); // an event may already have arrived before mount
    const onMessage = (event: MessageEvent) => {
      if (
        event.origin === "https://player.videasy.net" ||
        event.origin === "https://player.videasy.to"
      ) {
        notifyEventSeen();
      }
    };
    window.addEventListener("message", onMessage);
    const detach = attachCwRelay(
      {
        imdbId: cw.imdbId,
        tmdbId: cw.tmdbId,
        type: cw.type,
        title: cw.title,
        runtimeMin: cw.runtimeMin,
      },
      target.season,
      target.episode,
    );
    return () => {
      window.removeEventListener("message", onMessage);
      detach();
    };
  }, [cw, target.season, target.episode]);

  // US-4: subscribe to accepted relay samples for chip state. Events carry
  // their own season/episode, so the chip follows the embed across autoNext
  // self-advances (requested episode stays ours; active becomes theirs).
  useEffect(() => {
    if (!cw || cw.type !== "tv") return;
    return attachCwRelaySamples((sample) => {
      setActiveEp({ season: sample.season, episode: sample.episode });
      setEpProgress({ positionSec: sample.positionSec, durationSec: sample.durationSec });
    });
  }, [cw?.imdbId, cw?.type]);

  // US-4: the next episode of the active season, revealed only when the
  // active episode enters its final 90s or has ended (AC2). When the embed
  // self-advances (autoNext), activeEp moves ahead and `next` follows — the
  // chip hides once active is the season's last episode or cw is absent.
  const episodeList = cw && cw.type === "tv" ? (cw.episodes ?? []) : [];
  const sortedEpisodes = [...episodeList].sort((a, b) => a.number - b.number);
  let nextEpisode: { season: number; episode: number } | null = null;
  if (cw && cw.type === "tv" && activeEp && onNextEpisode) {
    const idx = sortedEpisodes.findIndex(
      (e) => e.season === activeEp.season && e.number === activeEp.episode,
    );
    const upcoming = idx >= 0 ? sortedEpisodes[idx + 1] : undefined;
    if (upcoming) {
      const duration = epProgress?.durationSec;
      const runtimeFallback = cw.runtimeMin ? cw.runtimeMin * 60 : undefined;
      const knownDuration =
        duration && !Number.isNaN(duration) && duration > 0 ? duration : runtimeFallback;
      const position = epProgress?.positionSec ?? 0;
      // Final 90s (covers ended too: position ≈ duration). No duration known
      // (no events yet, no runtime) -> chip stays hidden (honest default).
      const nearEnd =
        knownDuration !== undefined && position >= Math.max(0, knownDuration - NEXT_EPISODE_WINDOW_SEC);
      if (nearEnd) {
        nextEpisode = { season: upcoming.season, episode: upcoming.number };
      }
    }
  }

  function onIframeLoad() {
    const elapsed = Date.now() - shellStart.current;
    const wait = Math.max(0, 400 - elapsed); // never let the spinner flash
    window.setTimeout(() => setLoaded(true), wait);
  }

  const src = `${embedUrl(target, server)}${
    startSeconds && startSeconds > 5
      ? `${embedUrl(target, server).includes("?") ? "&" : "?"}progress=${Math.floor(startSeconds)}`
      : ""
  }`;

  return (
    <div className="flex w-full flex-col gap-2">
      <div
        className="relative w-full overflow-hidden rounded-[var(--radius-player)] bg-black shadow-[var(--shadow-player)]"
        style={{ aspectRatio: "16 / 9" }}
      >
        {/* Loading shell (M4): visible until the iframe load event + 400ms min. */}
        {loaded !== true && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-zinc-950">
            <div
              aria-hidden="true"
              className="absolute inset-0 scale-110 bg-cover bg-center opacity-40 blur-2xl"
              data-watch-backdrop={title ?? ""}
            />
            <svg
              className="relative h-8 w-8 animate-spin text-purple-500"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
              <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
            </svg>
            <p className="relative text-[13px] text-zinc-400" role="status">
              Warming up the stream…
            </p>
          </div>
        )}
        <iframe
          key={`${server}-${target.id}-${target.season ?? 0}-${target.episode ?? 0}`}
          src={src}
          onLoad={onIframeLoad}
          className={`absolute inset-0 h-full w-full border-0 transition-opacity duration-200 ${
            loaded === true ? "opacity-100" : "opacity-0"
          }`}
          allowFullScreen
          allow="autoplay; encrypted-media; picture-in-picture"
          title="Video player"
        />
      </div>

      {/* Chrome bar (M5): persistent below the iframe on all surfaces. */}
      <div className="flex flex-col gap-2 rounded-[var(--radius-control)] border border-zinc-800/70 bg-zinc-900/50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
        <span className="min-w-0 truncate text-sm text-zinc-400">
          {title && (
            <span className="text-zinc-200">
              {title}
              {label ? " · " : ""}
            </span>
          )}
          <span className="text-zinc-400">{label}</span>
        </span>
        <div className="flex items-center gap-1.5" role="group" aria-label="Server switcher">
          {SERVERS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setServer(s)}
              aria-pressed={server === s}
              className={`min-h-[44px] rounded-[var(--radius-control)] px-3 font-medium transition ${server === s ? "bg-purple-600 text-white" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"}`}
            >
              {SERVER_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {/* US-4 next-episode chip: appears in the final 90s / after end. One
          tap starts episode n+1 on the same server (AC2/AC4); hidden when the
          active episode is the season's last or events haven't reached the
          window yet. Wired to the WatchPanel play path via onNextEpisode. */}
      {nextEpisode && (
        <button
          type="button"
          onClick={() => onNextEpisode?.(nextEpisode.season, nextEpisode.episode)}
          className="flex min-h-[44px] w-full items-center justify-between gap-3 rounded-[var(--radius-control)] border border-purple-500/70 bg-purple-600/15 px-4 py-2 text-left motion-base hover:bg-purple-600/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
        >
          <span className="min-w-0 truncate text-sm text-zinc-200">
            Up next ·{" "}
            <span className="font-semibold text-purple-300">
              S{nextEpisode.season}E{nextEpisode.episode}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1.5 text-sm font-medium text-purple-300">
            Play next
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
              <path d="M8 5.14v13.72L19 12 8 5.14Z" />
            </svg>
          </span>
        </button>
      )}
      <p className="px-1 text-xs text-zinc-500">
        Not playing? Try another server above.
      </p>
    </div>
  );
}
