import { useState } from "react";
import { embedUrl } from "@/lib/videasy";
import type { EmbedTarget, ServerOption } from "@/lib/videasy";

export function Player({ target }: { target: EmbedTarget }) {
  const [server, setServer] = useState<ServerOption>("videasy");

  return (
    <div className="flex flex-col gap-2 w-full">
      <div
        className="relative w-full overflow-hidden rounded-xl bg-black shadow-lg"
        style={{ aspectRatio: "16 / 9" }}
      >
        <iframe
          key={`${server}-${target.id}`}
          src={embedUrl(target, server)}
          className="absolute inset-0 h-full w-full border-0"
          allowFullScreen
          allow="autoplay; encrypted-media; picture-in-picture"
          title="Video player"
        />
      </div>

      <div className="flex flex-col gap-2 text-xs text-zinc-400 px-0 sm:flex-row sm:items-center sm:justify-between">
        <span>If video doesn't play or errors, switch server:</span>
        <div className="flex items-center gap-1.5">
          {(["videasy", "vidlink", "vidsrc"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setServer(s)}
              className={`min-h-[44px] rounded px-3 font-medium transition ${
                server === s
                  ? "bg-purple-600 text-white"
                  : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
              }`}
            >
              {s === "videasy" ? "Videasy" : s === "vidlink" ? "VidLink" : "Vidsrc"}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
