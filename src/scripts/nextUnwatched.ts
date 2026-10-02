// US-4 AC1/AC3 (KUR-49.3): the hero CTA's default action is "Play S1E1 (or
// next unwatched)" and returning to a series deep-links play to the next
// unwatched episode. SSR can't see localStorage, so this client script runs on
// series detail pages and rewrites the CTA when all of these hold:
//   1. the page URL has no explicit ?ep= pin (user intent wins)
//   2. no fresh cw.v1 in-progress entry for this title (cwResumeLabel owns
//      that case and runs after this script)
//   3. at least one episode of the rendered season is unwatched
// Then the CTA points at the FIRST unwatched episode (E1, E2, ...) with a
// "Play S{n}E{m}" label; stickyHeader mirrors it (MutationObserver on href).
// Watched set: videasy:watched.v1 via the shared lib (episode-keyed entries
// plus legacy whole-title ids).

import { isEpisodeWatched, loadEntries } from "@/lib/continueWatching";

function ready(fn: () => void): void {
  if (document.readyState !== "loading") fn();
  else document.addEventListener("DOMContentLoaded", fn);
}

ready(() => {
  const cta = document.getElementById("hero-play");
  if (!cta || cta.getAttribute("data-cw-resume-type") !== "tv") return;

  const imdbId = cta.getAttribute("data-cw-resume-target") ?? "";
  if (!imdbId) return;

  // Case 1: an explicit ?ep= deep link pins the target — never rewrite.
  const pageUrl = new URL(window.location.href);
  if (pageUrl.searchParams.has("ep")) return;

  // Case 2: in-progress resume data exists — cwResumeLabel rewrites the CTA
  // for it after this script; don't fight it.
  const entry = loadEntries().find((e) => e.imdbId === imdbId);
  if (entry && entry.positionSec && entry.positionSec > 5) return;

  const season = Number(cta.getAttribute("data-cw-resume-season") ?? "0");
  const opener = Number(cta.getAttribute("data-cw-resume-episode") ?? "1");
  if (!season) return;

  // Case 3: find the first unwatched episode of the rendered season.
  const rows = [
    ...document.querySelectorAll<HTMLElement>(
      `#episode-list .episode-btn[data-season='${season}']`,
    ),
  ];
  if (rows.length === 0) return;
  let target: number | null = null;
  for (const row of rows) {
    const ep = Number(row.getAttribute("data-episode") ?? "0");
    if (ep && !isEpisodeWatched(imdbId, season, ep)) {
      target = ep;
      break;
    }
  }
  if (target === null || target === opener) return;

  const href = new URL(cta.getAttribute("href") ?? "?play=1", window.location.href);
  href.searchParams.set("ep", `S${season}E${target}`);
  cta.setAttribute("href", `?${href.searchParams.toString()}`);
  const label = document.getElementById("hero-play-label");
  if (label) label.textContent = `Play S${season}E${target}`;
});
