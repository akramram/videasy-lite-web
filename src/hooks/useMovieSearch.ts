import { useEffect, useRef, useState } from "react";
import { ApiError, rankResults, searchMovies, parseQuery } from "@/lib/cinemeta";
import type { SearchState } from "@/lib/states";

const DEBOUNCE_MS = 250;
const MIN_QUERY_LEN = 2;

/**
 * Debounced autocomplete search against /api/search (SSR proxy -> Cinemeta).
 * Race-safe: only the latest request's result is committed.
 */
export function useMovieSearch(): {
  query: string;
  setQuery: (q: string) => void;
  state: SearchState;
} {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<SearchState>({ kind: "idle" });
  const controllerRef = useRef<AbortController | null>(null);
  const seqRef = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LEN) {
      controllerRef.current?.abort();
      setState({ kind: "idle" });
      return;
    }

    const seq = ++seqRef.current;
    setState({ kind: "loading" });
    const timer = window.setTimeout(async () => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      try {
        const catalog = await searchMovies(trimmed, controller.signal);
        if (seq !== seqRef.current) return; // stale response, drop
        const parsed = parseQuery(trimmed);
        const results = rankResults(catalog.metas, parsed);
        setState(results.length > 0 ? { kind: "success", results } : { kind: "empty" });
      } catch (cause) {
        if (controller.signal.aborted || seq !== seqRef.current) return;
        const message =
          cause instanceof ApiError ? cause.message : "unexpected error";
        setState({ kind: "error", message });
      }
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [query]);

  return { query, setQuery, state };
}
