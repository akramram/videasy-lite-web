import { useId, useState } from "react";
import { posterUrl } from "@/lib/cinemeta";
import type { Meta } from "@/lib/cinemeta";
import { useMovieSearch } from "@/hooks/useMovieSearch";
import { Player } from "@/components/Player";

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

export function SearchBox() {
  const { query, setQuery, state } = useMovieSearch();
  const [open, setOpen] = useState(true);
  const [target, setTarget] = useState<{ id: string; name: string } | null>(null);
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
        placeholder="Search movies — title or title + year…"
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
            <li className="px-4 py-3 text-sm text-zinc-400">No results.</li>
          )}
          {state.kind === "error" && (
            <li className="px-4 py-3 text-sm text-red-400">
              Something went wrong — try again.
            </li>
          )}
          {state.kind === "success" &&
            state.results.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setTarget({ id: m.id, name: m.name });
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-zinc-800"
                >
                  <span className="h-14 w-10 shrink-0 overflow-hidden rounded bg-zinc-800">
                    <Poster meta={m} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-zinc-100">
                      {m.name}
                    </span>
                    <span className="block text-xs text-zinc-500">
                      {m.releaseInfo}
                    </span>
                  </span>
                </button>
              </li>
            ))}
        </ul>
      )}

      {target && (
        <div className="mt-6">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-lg font-semibold text-zinc-100">{target.name}</h2>
            <button
              type="button"
              onClick={() => setTarget(null)}
              className="text-xs text-zinc-400 hover:text-zinc-200"
            >
              close
            </button>
          </div>
          <Player target={{ type: "movie", id: target.id }} />
        </div>
      )}
    </div>
  );
}
