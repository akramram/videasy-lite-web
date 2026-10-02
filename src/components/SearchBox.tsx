import { useEffect, useId, useRef, useState } from "react";
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

function SkeletonRow() {
  return (
    <li className="flex items-center gap-3 px-3 py-2" aria-hidden="true">
      <span className="anim-shimmer h-[60px] w-10 shrink-0 rounded bg-zinc-800" />
      <span className="min-w-0 flex-1">
        <span className="anim-shimmer mb-1.5 block h-3.5 w-2/3 rounded bg-zinc-800" />
        <span className="anim-shimmer block h-3 w-1/3 rounded bg-zinc-800" />
      </span>
    </li>
  );
}

/**
 * Autocomplete search. Every result is a real link to its detail page
 * (/title/{imdb} or /tv/{imdb}) so results are shareable, keyboard-navigable,
 * and open even with client JS disabled. The old inline-player mode is gone:
 * detail pages are the single watch surface (KUR-25).
 *
 * A11y (KUR-49.2 A4/M3): combobox pattern — ↑/↓ move the active descendant,
 * Enter opens it, Esc closes; selection follows aria-activedescendant.
 * The blur race (A5) is gone: the list closes on outside pointerdown, and
 * loading shows skeleton rows instead of collapsing text.
 */
export function SearchBox() {
  const { query, setQuery, state } = useMovieSearch();
  const [open, setOpen] = useState(true);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const results = state.kind === "success" ? state.results : [];
  const showList = open && state.kind !== "idle";

  // Close on outside pointerdown (touch-safe; replaces the 120ms blur timer).
  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  // Reset the active item whenever the result set changes.
  useEffect(() => {
    setActiveIndex(-1);
  }, [state]);

  function onKeyDown(event: React.KeyboardEvent) {
    if (!showList) return;
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (state.kind !== "success" || results.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      const picked = results[activeIndex];
      if (picked) window.location.assign(detailHref(picked));
    }
  }

  return (
    <div ref={rootRef} className="relative mx-auto w-full max-w-xl">
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={
          activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined
        }
        aria-autocomplete="list"
        autoComplete="off"
        placeholder="Search movies and series — title or title + year…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        onFocus={() => setOpen(true)}
        className="w-full rounded-full border border-zinc-700 bg-zinc-900/80 px-5 py-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-purple-500"
      />

      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="anim-fade-rise absolute z-20 mt-2 max-h-96 w-full overflow-auto rounded-[var(--radius-card)] border border-zinc-800 bg-zinc-900 shadow-xl shadow-black/40"
        >
          {state.kind === "loading" && (
                <>
                  <SkeletonRow />
                  <SkeletonRow />
                  <SkeletonRow />
                </>
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
            results.map((m, index) => (
              <li
                key={m.id}
                id={`${listId}-option-${index}`}
                role="option"
                aria-selected={index === activeIndex}
              >
                <a
                  href={detailHref(m)}
                  className={`flex w-full items-center gap-3 px-3 py-2 text-left outline-none motion-fast ${
                    index === activeIndex
                      ? "bg-purple-500/15"
                      : "hover:bg-zinc-800 focus-visible:bg-purple-500/15"
                  }`}
                  onMouseEnter={() => setActiveIndex(index)}
                >
                  <span className="h-14 w-10 shrink-0 overflow-hidden rounded-[var(--radius-still)] bg-zinc-800">
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
