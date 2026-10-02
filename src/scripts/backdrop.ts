// Fill [data-watch-backdrop] holders with the title's backdrop image.
// Plain DOM so both the React pre-play shell and the player loading shell can
// use it without prop-drilling image URLs through islands.
function ready(fn: () => void): void {
  if (document.readyState !== "loading") fn();
  else document.addEventListener("DOMContentLoaded", fn);
}

ready(() => {
  const imdbId =
    document.querySelector<HTMLElement>("[data-title-id]")?.dataset.titleId;
  if (!imdbId) return;
  const url = `https://images.metahub.space/background/medium/${imdbId}/img`;
  for (const el of document.querySelectorAll<HTMLElement>("[data-watch-backdrop]")) {
    el.style.backgroundImage = `url("${url}")`;
  }
});
export {};
