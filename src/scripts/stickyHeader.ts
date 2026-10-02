// US-5 sticky mini-header (KUR-49.2 §4-B). The SSR bar renders hidden; this
// script reveals it (motion-base fade) once the hero CTA scrolls out and hides
// it again when the hero is back, then mirrors the hero CTA's live label/href
// (incl. cwResumeLabel's Resume rewrite) and aria-label onto #sticky-play.
// Threshold is IntersectionObserver on the hero CTA itself — no scroll-math
// drift across viewports. Escape hatch: absent #sticky-header or #hero-play =
// home page or markup change -> no-op.

function ready(fn: () => void): void {
  if (document.readyState !== "loading") fn();
  else document.addEventListener("DOMContentLoaded", fn);
}

function setVisible(bar: HTMLElement, visible: boolean): void {
  if (visible) {
    bar.classList.remove("hidden");
    bar.dataset.stickyState = "visible";
  } else {
    bar.classList.add("hidden");
    bar.dataset.stickyState = "hidden";
  }
}

function sync(bar: HTMLElement, hero: HTMLElement): void {
  const href = hero.getAttribute("href");
  const labelEl = document.getElementById("hero-play-label");
  const label = labelEl?.textContent?.trim() ?? "";
  const stickyLabel = document.getElementById("sticky-play-label");
  if (href) bar.querySelector<HTMLAnchorElement>("#sticky-play")?.setAttribute("href", href);
  if (label && stickyLabel) stickyLabel.textContent = label;
  const aria = hero.getAttribute("aria-label");
  bar.querySelector<HTMLAnchorElement>("#sticky-play")?.setAttribute(
    "aria-label",
    aria ?? `Play ${label}`,
  );
}

ready(() => {
  const bar = document.getElementById("sticky-header");
  const hero = document.querySelector<HTMLElement>("[data-sticky-src='hero']");
  if (!bar || !hero) return;

  sync(bar, hero);

  // Mirror the hero's Resume relabel/rewrite whenever it changes
  // (cwResumeLabel mutates #hero-play on the same page).
  const observer = new MutationObserver(() => sync(bar, hero));
  observer.observe(hero, { attributes: true, attributeFilter: ["href", "aria-label"] });
  const heroLabel = document.getElementById("hero-play-label");
  if (heroLabel) {
    observer.observe(heroLabel, { childList: true, characterData: true, subtree: true });
  }

  // Reveal after the hero CTA leaves the viewport; hide when it returns.
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) setVisible(bar, !entry.isIntersecting);
    },
    { threshold: 0 },
  );
  io.observe(hero);
});
