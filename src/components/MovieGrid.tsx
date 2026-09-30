import { useState } from "react";
import type { Meta } from "@/lib/cinemeta";
import { posterUrl } from "@/lib/cinemeta";
import { Player } from "@/components/Player";

function MovieCard({ meta }: { meta: Meta }) {
  const [playing, setPlaying] = useState(false);
  return (
    <li className="group relative">
      {playing ? (
        <Player target={{ type: "movie", id: meta.id }} />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          className="block w-full text-left"
          aria-label={`Play ${meta.name}`}
        >
          <span className="block aspect-2/3 w-full overflow-hidden rounded-lg bg-zinc-800 transition group-hover:ring-2 group-hover:ring-purple-500">
            <img
              src={posterUrl(meta.id)}
              alt={meta.name}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
            />
          </span>
          <span className="mt-2 block truncate text-sm text-zinc-200">
            {meta.name}
          </span>
          <span className="block text-xs text-zinc-500">{meta.releaseInfo}</span>
        </button>
      )}
    </li>
  );
}

export function MovieGrid({ metas }: { metas: readonly Meta[] }) {
  return (
    <ul className="mx-auto grid w-full max-w-6xl grid-cols-2 gap-4 px-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {metas.map((m) => (
        <MovieCard key={m.id} meta={m} />
      ))}
    </ul>
  );
}
