import { embedUrl } from "@/lib/videasy";
import type { EmbedTarget } from "@/lib/videasy";

export function Player({ target }: { target: EmbedTarget }) {
  return (
    <div
      className="relative w-full overflow-hidden rounded-xl bg-black"
      style={{ aspectRatio: "16 / 9" }}
    >
      <iframe
        src={embedUrl(target)}
        className="absolute inset-0 h-full w-full border-0"
        allowFullScreen
        allow="autoplay; encrypted-media; picture-in-picture"
        title="Videasy player"
      />
    </div>
  );
}
