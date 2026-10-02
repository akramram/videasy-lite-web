// Episode + season wiring for the title page. Plain DOM, no island needed:
// Astro reloads on navigation, so the player iframe swap is a fresh SSR render.
//
// Controls rendered only when the title is a series with episodes:
//   #season-select  (S1..Sn dropdown, hidden when there is a single season)
//   .episode-btn    (per-episode rows: 16:9 still + watched check + label)
//
// Multi-season pages submit ?s=N and the SSR page renders that season's
// episodes; single-season pages swap the player target directly, no reload.
//
// US-4 (KUR-55): watched checkmarks from videasy:watched.v1 (episode-keyed or
// legacy whole-title), click sets ?ep= via replaceState (A7), and a CW entry
// for this title pre-highlights its stored episode.

import { isEpisodeWatched, loadEntries } from "@/lib/continueWatching";

function ready(fn: () => void): void {
  if (document.readyState !== "loading") fn();
  else document.addEventListener("DOMContentLoaded", fn);
}

function setEpParam(season: number, episode: number): void {
  const url = new URL(window.location.href);
  url.searchParams.set("ep", `S${season}E${episode}`);
  history.replaceState(null, "", url);
}

ready(() => {
  const list = document.getElementById("episode-list");
  if (!list) return; // movie, or series without episode data
  const episodeList: HTMLElement = list;

  const titleEl = document.querySelector("[data-title-id]");
  const imdbId = titleEl?.getAttribute("data-title-id") ?? "";
  const select = document.getElementById("season-select") as HTMLSelectElement | null;
  const multi = select !== null && list.children.length === 0;
  const panel = document.querySelector<HTMLDivElement>("[data-watch-panel]");

  const markActive = (btn: Element): void => {
    for (const b of list.querySelectorAll(".episode-btn")) {
      b.classList.remove("border-purple-500/80", "bg-zinc-900", "text-purple-300");
    }
    btn.classList.add("border-purple-500/80", "bg-zinc-900", "text-purple-300");
  };

  // US-4 §4-C watched states: dim the row, swap the still for the amber
  // check. Episode-keyed entries count; a legacy whole-title entry marks the
  // whole season (conservative display of legacy data).
  function applyWatchedStates(): void {
    if (!imdbId) return;
    for (const btn of episodeList.querySelectorAll(".episode-btn")) {
      const season = Number(btn.getAttribute("data-season") ?? "0");
      const episode = Number(btn.getAttribute("data-episode") ?? "0");
      if (!season || !episode) continue;
      const watched = isEpisodeWatched(imdbId, season, episode);
      btn.classList.toggle("opacity-60", watched);
      const check = btn.querySelector<HTMLElement>(".ep-watched-check");
      if (check) {
        check.classList.toggle("hidden", !watched);
        check.classList.toggle("flex", watched);
      }
      const num = btn.querySelector<HTMLElement>(".ep-num");
      if (num) num.classList.toggle("hidden", watched);
    }
  }
  applyWatchedStates();

  // Multi-season: the SSR grid is empty until ?s=N renders it server-side.
  if (multi) {
    select?.addEventListener("change", () => {
      const url = new URL(window.location.href);
      url.searchParams.set("s", select.value);
      window.location.assign(url);
    });
    return;
  }

  // Single season: wire the flat episode list to the player island.
  function play(season: string, episode: string, title: string, btn: Element): void {
    markActive(btn);
    setEpParam(Number(season), Number(episode));
    if (!panel) return;
    panel.dispatchEvent(
      new CustomEvent("videasy:play", {
        bubbles: true,
        detail: { season: Number(season), episode: Number(episode), title },
      }),
    );
  }

  for (const btn of list.querySelectorAll(".episode-btn")) {
    btn.addEventListener("click", () => {
      play(
        btn.getAttribute("data-season") ?? "1",
        btn.getAttribute("data-episode") ?? "1",
        btn.getAttribute("data-title") ?? "",
        btn,
      );
    });
  }

  // Deep-link restore: ?ep=S2E4 highlights without replaying.
  const params = new URLSearchParams(window.location.search);
  const ep = params.get("ep");
  const highlight = (selector: string): boolean => {
    const match = episodeList.querySelector(selector);
    if (match) {
      markActive(match);
      return true;
    }
    return false;
  };
  let restored = false;
  if (ep) {
    const m = /^S(\d+)E(\d+)$/.exec(ep);
    if (m) {
      restored = highlight(`.episode-btn[data-season="${m[1]}"][data-episode="${m[2]}"]`);
    }
  }
  // US-4: no ?ep= (or it didn't match) — highlight the episode a cw.v1 entry
  // points at so reload keeps context (A7 companion).
  if (!restored && imdbId) {
    const entry = loadEntries().find((e) => e.imdbId === imdbId);
    if (entry?.season && entry?.episode) {
      highlight(`.episode-btn[data-season="${entry.season}"][data-episode="${entry.episode}"]`);
    }
  }
});
