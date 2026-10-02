// Continue-watching row renderer (home). Reads videasy:cw.v1, renders cards
// from the ContinueWatching.astro template, wires remove + deep links:
//   movie card -> /title/{imdb}?play=1&progress={pos}
//   series card -> /tv/{imdb}?play=1&progress={pos}   (player starts at the
//   stored episode via ?s=N + ?ep=; progress resumes via embed param)
// Remove = fade+collapse (M9), then store removal; row reflows.

import { loadEntries, removeEntry, entrySubline, type CwEntry } from "@/lib/continueWatching";

function ready(fn: () => void): void {
  if (document.readyState !== "loading") fn();
  else document.addEventListener("DOMContentLoaded", fn);
}

function cardHref(entry: CwEntry, progressSec: number): string {
  const params = new URLSearchParams({ play: "1" });
  if (progressSec > 5) params.set("progress", String(Math.floor(progressSec)));
  if (entry.type === "tv" && entry.season) {
    params.set("s", String(entry.season));
    if (entry.episode) params.set("ep", `S${entry.season}E${entry.episode}`);
  }
  const base = entry.type === "tv" ? `/tv/${entry.imdbId}` : `/title/${entry.imdbId}`;
  return `${base}?${params.toString()}`;
}

function render(): void {
  const row = document.getElementById("cw-row");
  const list = document.getElementById("cw-list");
  const template = document.getElementById("cw-card-template") as HTMLTemplateElement | null;
  if (!row || !list || !template) return;

  const entries = loadEntries();
  if (entries.length === 0) {
    row.classList.add("hidden");
    list.replaceChildren();
    return;
  }

  row.classList.remove("hidden");
  list.replaceChildren();

  for (const entry of entries) {
    const node = template.content.firstElementChild?.cloneNode(true) as HTMLElement | null;
    if (!node) return;

    const link = node.querySelector("a");
    const img = node.querySelector("img");
    const title = node.querySelector<HTMLElement>(".cw-title");
    const sub = node.querySelector<HTMLElement>(".cw-sub");
    const bar = node.querySelector<HTMLElement>(".cw-progress");
    const remove = node.querySelector<HTMLButtonElement>(".cw-remove");

    const still = `https://images.metahub.space/background/medium/${entry.imdbId}/img`;
    if (img) {
      img.setAttribute("src", still);
      img.addEventListener("load", () => img.classList.replace("opacity-0", "opacity-100"));
    }
    if (link) link.setAttribute("href", cardHref(entry, entry.positionSec ?? 0));
    if (title) title.textContent = entry.title;
    if (sub) sub.textContent = entrySubline(entry);
    if (bar) bar.style.width = `${Math.round(Math.min(Math.max(entry.progress, 0.02), 0.97) * 100)}%`;

    if (remove) {
      remove.setAttribute(
        "aria-label",
        `Remove ${entry.title} from Continue watching`,
      );
      remove.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        // M9: fade + collapse, then remove from the store and re-render.
        node.style.transition = "opacity 200ms cubic-bezier(0.3,0,0.8,0.15)";
        node.style.opacity = "0";
        window.setTimeout(() => {
          removeEntry(entry.imdbId);
          render();
        }, 200);
      });
    }

    list.appendChild(node);
  }
}

ready(() => {
  render();
  // Keep the row fresh when a sample lands in another tab.
  window.addEventListener("videasy:cw-changed", render);
});
