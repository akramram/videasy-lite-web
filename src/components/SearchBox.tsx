import { useId, useState } from "react";
import { posterUrl } from "@/lib/cinemeta";
import type { Meta } from "@/lib/cinemeta";
import { useMovieSearch } from "@/hooks/useMovieSearch";

function Poster({ meta }: { meta: Meta }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <img
      src={posterUrl(meta.id)}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className="h-full w-full object-cover"
    />
  );
}

function detailHref(m: Meta): string {
  return m.type === "series" ? `/tv/${m.id}` : `/title/${m.id}`;
}

/**
 * Autocomplete search. Every result is a real link to its detail page
 * (/title/{imdb} or /tv/{imdb}) so results are shareable, keyboard-navigable,
 * and open even with client JS disabled. The old inline-player mode is gone:
 * detail pages are the single watch surface (KUR-25).
 */
export function SearchBox() {
  const { query, setQuery, state } = useMovieSearch();
  const [open, setOpen] = useState(true);
  const listId = useId();
  const showList = open && state.kind !== "idle";

  return (
    <div className="relative mx-auto w-full max-w-xl">
      <input
        type="search"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder="Search movies and series — title or title + year…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onFocus={() => setOpen(true)}
        className="w-full rounded-full border border-zinc-700 bg-zinc-900/80 px-5 py-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-purple-500"
      />

      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-2 max-h-96 w-full overflow-auto rounded-xl border border-zinc-800 bg-zinc-900 shadow-xl shadow-black/40"
        >
          {state.kind === "loading" && (
            <li className="px-4 py-3 text-sm text-zinc-400">Searching…</li>
          )}
          {state.kind === "empty" && (
            <li className="px-4 py-3 text-sm text-zinc-400">
              No results. Try a different title or add a year.
            </li>
          )}
          {state.kind === "error" && (
            <li className="px-4 py-3 text-sm text-red-400">
              Something went wrong — try again.
            </li>
          )}
          {state.kind === "success" &&
            state.results.map((m) => (
              <li key={m.id}>
                <a
                  href={detailHref(m)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-zinc-800 focus:bg-zinc-800 focus:outline-none"
                >
                  <span className="h-14 w-10 shrink-0 overflow-hidden rounded bg-zinc-800">
                    <Poster meta={m} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-zinc-100">
                      {m.name}
                    </span>
                    <span className="block text-xs text-zinc-500">
                      {m.type === "series" ? "Series" : "Movie"} · {m.releaseInfo}
                    </span>
                  </span>
                </a>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
