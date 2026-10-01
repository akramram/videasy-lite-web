import { useState } from "react";
import { Player } from "@/components/Player";
import type { EmbedTarget } from "@/lib/videasy";

interface WatchPanelProps {
  target: EmbedTarget;
  /** Series title (episode naming) or movie title. */
  title: string;
  backHref: string;
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
 * action (poster placeholder, episode button, or Play button); the page stays
 * cheap and quiet otherwise. Episode buttons reach it via the `videasy:play`
 * DOM event dispatched from src/scripts/detail.ts.
 */
export function WatchPanel({ target, title, backHref }: WatchPanelProps) {
  const [now, setNow] = useState<NowPlaying | null>(null);
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
        className="overflow-hidden rounded-xl border border-zinc-800/70 bg-zinc-900/50"
      >
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
          className="group relative flex aspect-video w-full items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
          aria-label={`Play ${title}`}
        >
          {isEpisodeTarget(target) ? (
            <span className="text-sm text-zinc-400">
              Play S{target.season}E{target.episode}
            </span>
          ) : (
            <span className="text-sm text-zinc-400">Play trailer-style embed</span>
          )}
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-purple-600 text-white shadow-lg transition group-hover:scale-105 group-hover:bg-purple-500 focus:outline-none">
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
    <div data-watch-panel="" className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-xs text-zinc-400">
        <span className="min-w-0 truncate">
          Now playing: <span className="text-zinc-200">{now.label}</span>
        </span>
        <a href={backHref} className="shrink-0 text-zinc-400 hover:text-zinc-200">
          Back to search
        </a>
      </div>
      <Player target={now.target} />
    </div>
  );
}
