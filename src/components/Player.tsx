import { useEffect, useRef, useState } from "react";
import { embedUrl } from "@/lib/videasy";
import type { EmbedTarget, ServerOption } from "@/lib/videasy";
import { attachCwRelay } from "@/scripts/cwPlayer";
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
  };
}

const SERVERS: readonly ServerOption[] = ["videasy", "vidlink", "vidsrc"];
const SERVER_LABELS: Record<ServerOption, string> = {
  videasy: "Videasy",
  vidlink: "VidLink",
  vidsrc: "Vidsrc",
};

/**
 * Embedded player surface (design §4-D, M4/M5):
 * - loading shell: dimmed blurred backdrop + spinner + status line while the
 *   cross-origin iframe loads; iframe fades in on load; >=400ms shell minimum
 *   so the spinner never flashes;
 * - chrome bar under the iframe: now-playing + server switcher (persistent on
 *   touch — never overlays the iframe).
 */
export function Player({ target, startSeconds, title, label, cw }: PlayerProps) {
  const [server, setServer] = useState<ServerOption>("videasy");
  // undefined = iframe still loading; true = loaded (faded in).
  const [loaded, setLoaded] = useState<boolean | null>(null);
  const shellStart = useRef<number>(0);

  // M4: restart the loading shell whenever the embed (server or episode) swaps.
  useEffect(() => {
    setLoaded(null);
    shellStart.current = Date.now();
  }, [server, target.id, target.season, target.episode]);

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
      <p className="px-1 text-xs text-zinc-500">
        Not playing? Try another server above.
      </p>
    </div>
  );
}
