// US-1 hero CTA relabel: "Play movie" -> "Resume S2E4 · 35 min left" when the
// continue-watching store holds fresh progress for THIS title. Runs on the
// detail page (TitlePage.astro) against the data-cw-resume-* attributes, and
// rewrites the CTA href to the stored episode + position so one tap lands
// mid-playback. Store contract: videasy:cw.v1 (src/lib/continueWatching.ts).

import { loadEntries } from "@/lib/continueWatching";

function ready(fn: () => void): void {
  if (document.readyState !== "loading") fn();
  else document.addEventListener("DOMContentLoaded", fn);
}

ready(() => {
  const label = document.getElementById("hero-play-label");
  const cta = document.getElementById("hero-play");
  if (!label || !cta) return;

  const imdbId = cta.getAttribute("data-cw-resume-target") ?? "";
  const isTv = cta.getAttribute("data-cw-resume-type") === "tv";
  const entry = loadEntries().find((e) => e.imdbId === imdbId);
  if (!entry || !entry.positionSec || entry.positionSec <= 5) return;

  // Fresh entry for this title -> deep-link the CTA to the stored episode
  // and position (US-1 one-tap resume).
  const params = new URLSearchParams(cta.getAttribute("href") ?? "?play=1");
  params.set("progress", String(Math.floor(entry.positionSec)));
  if (isTv && entry.season) params.set("s", String(entry.season));
  if (isTv && entry.season && entry.episode) {
    params.set("ep", `S${entry.season}E${entry.episode}`);
  }
  cta.setAttribute("href", `?${params.toString()}`);

  const leftMin = entry.durationSec
    ? Math.max(1, Math.round((entry.durationSec - entry.positionSec) / 60))
    : entry.runtimeMin
      ? Math.max(1, Math.round(entry.runtimeMin * (1 - entry.progress)))
      : null;
  const parts: string[] = [];
  if (isTv && entry.season && entry.episode) parts.push(`S${entry.season}E${entry.episode}`);
  if (leftMin) parts.push(`${leftMin} min left`);
  label.textContent = `Resume${parts.length > 0 ? ` ${parts.join(" · ")}` : ""}`;
  cta.setAttribute(
    "aria-label",
    `Resume ${cta.getAttribute("data-cw-resume-name") ?? ""}`,
  );
});
