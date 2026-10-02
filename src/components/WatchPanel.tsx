import { useEffect, useRef, useState } from "react";
import { Player } from "@/components/Player";
import type { EmbedTarget } from "@/lib/videasy";
import { startWallClockSession, stopWallClockSession, installWallClockFallback } from "@/scripts/cwWallClock";
import type { CwRelayContext } from "@/scripts/cwPlayer";

interface WatchPanelProps {
  target: EmbedTarget;
  /** Series title (episode naming) or movie title. */
  title: string;
  backHref: string;
  /** Auto-mount the player on first render (deep-link ?play=1 / Resume, US-2). */
  autoPlay?: boolean;
  /** Resume start position in seconds (US-1, ?progress= embed param). */
  startSeconds?: number;
  /** Continue-watching context; relay attaches only when present (US-1). */
  cw?: CwRelayContext;
}

type NowPlaying = {
  target: EmbedTarget;
  label: string;
};

function isEpisodeTarget(t: EmbedTarget): t is EmbedTarget & { season: number; episode: number } {
  return t.type === "tv";
}

/**
 * Detail-page watch panel. Renders the player only after an explicit play
 * action (poster placeholder, episode button, Play/Resume CTA, or ?play=1
 * deep link); the page stays cheap and quiet otherwise. Episode buttons reach
 * it via the `videasy:play` DOM event from src/scripts/detail.ts.
 */
export function WatchPanel({ target, title, backHref, autoPlay = false, startSeconds, cw }: WatchPanelProps) {
  const [now, setNow] = useState<NowPlaying | null>(
    autoPlay
      ? {
          target,
          label: isEpisodeTarget(target)
            ? `S${target.season}E${target.episode}`
            : title,
        }
      : null,
  );
  // US-1: episode switches replace the target wholesale; the wall-clock
  // fallback session + Player relay must follow the one actually playing.
  const [cwNow, setCwNow] = useState<CwRelayContext | null>(cw ?? null);
  const cwRef = useRef<CwRelayContext | null>(cw ?? null);
  cwRef.current = cw ?? null;

  // US-1 wall-clock fallback session (Amendment 1: relay is primary, this is
  // the >=15s-no-event fallback). Runs while a player is mounted; the ticker
  // itself is installed below so it survives across episode switches.
  useEffect(() => {
    if (!cwNow) return;
    startWallClockSession({
      imdbId: cwNow.imdbId,
      title: cwNow.title,
      type: cwNow.type,
      season: cwNow.type === "tv" ? now?.target.season : undefined,
      episode: cwNow.type === "tv" ? now?.target.episode : undefined,
    });
    return () => stopWallClockSession();
  }, [cwNow, now?.target.season, now?.target.episode]);

  // The 10s estimation ticker — installed once per active player lifetime.
  useEffect(() => {
    if (!cwNow) return;
    const runtimeMinFor = () => cwNow.runtimeMin;
    return installWallClockFallback(runtimeMinFor);
  }, [cwNow]);
  const [bound] = useState(() => {
    // Bridge from the plain-TS episode list (src/scripts/detail.ts).
    // useState initializer: bound exactly once, even in StrictMode/dev remounts.
    if (typeof document !== "undefined") {
      document.addEventListener(
        "videasy:play",
        ((event: CustomEvent<{ season: number; episode: number; title: string }>) => {
          const { season, episode, title: epTitle } = event.detail;
          setNow({
            target: { ...target, type: "tv", season, episode },
            label: epTitle ? `S${season}E${episode} · ${epTitle}` : `S${season}E${episode}`,
          });
          // Keep the CW context identical but pin the played episode.
          if (cwRef.current) {
            setCwNow({ ...cwRef.current });
          }
          document
            .querySelector("[data-watch-panel]")
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
        }) as EventListener,
      );
    }
    return true;
  });
  void bound;

  function play(t: EmbedTarget, label: string) {
    setNow({ target: t, label });
    // Keep the CW context identical but pin the played episode.
    if (cwRef.current) setCwNow({ ...cwRef.current });
    // Bring the player into view; it mounts above the episode list.
    document.querySelector("[data-watch-panel]")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  if (!now) {
    return (
      <div
        data-watch-panel=""
        className="scroll-mt-20 relative overflow-hidden rounded-[var(--radius-player)] border border-zinc-800/70 bg-zinc-900/50"
      >
        {/* Pre-play surface reads as "video about to happen": blurred poster
            backdrop behind the FAB (design §4-D). */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 scale-110 bg-cover bg-center opacity-40 blur-2xl motion-base"
          data-watch-backdrop={title}
        />
        <button
          type="button"
          onClick={() =>
            play(
              target,
              isEpisodeTarget(target)
                ? `S${target.season}E${target.episode}`
                : title,
            )
          }
          className="relative flex aspect-video w-full items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 motion-fast active:scale-[0.98]"
          aria-label={`Play ${title}`}
        >
          {isEpisodeTarget(target) ? (
            <span className="text-sm text-zinc-300">
              Play S{target.season}E{target.episode}
            </span>
          ) : (
            <span className="text-sm text-zinc-300">Play movie</span>
          )}
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-purple-600 text-white shadow-lg motion-fast group-hover:scale-105 active:scale-95">
              <svg viewBox="0 0 24 24" className="ml-1 h-7 w-7" fill="currentColor" aria-hidden="true">
                <path d="M8 5.14v13.72L19 12 8 5.14Z" />
              </svg>
            </span>
          </span>
        </button>
      </div>
    );
  }

  return (
    <div data-watch-panel="" className="scroll-mt-20 flex flex-col gap-2">
      <div className="flex items-center justify-between text-xs text-zinc-400">
        <span className="min-w-0 truncate">
          Now playing: <span className="text-zinc-200">{now.label}</span>
        </span>
        <a href={backHref} className="p-2 -m-2 shrink-0 text-zinc-400 hover:text-zinc-200">
          Back to search
        </a>
      </div>
      <Player target={now.target} startSeconds={startSeconds} title={title} label={now.label} cw={cwNow ?? undefined} />
    </div>
  );
}
