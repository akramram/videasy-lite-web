// Episode + season wiring for the title page. Plain DOM, no island needed:
// Astro reloads on navigation, so the player iframe swap is a fresh SSR render.
//
// Controls rendered only when the title is a series with episodes:
//   #season-select  (S1..Sn dropdown, hidden when there is a single season)
//   .episode-btn    (per-episode buttons, flat list when single season)
//
// Multi-season pages submit ?s=N and the SSR page renders that season's
// episodes; single-season pages swap the player target directly, no reload.

function ready(fn: () => void): void {
  if (document.readyState !== "loading") fn();
  else document.addEventListener("DOMContentLoaded", fn);
}

ready(() => {
  const list = document.getElementById("episode-list");
  if (!list) return; // movie, or series without episode data

  const select = document.getElementById("season-select") as HTMLSelectElement | null;
  const multi = select !== null && list.children.length === 0;
  const panel = document.querySelector<HTMLDivElement>("[data-watch-panel]");

  const markActive = (btn: Element): void => {
    for (const b of list.querySelectorAll(".episode-btn")) {
      b.classList.remove("border-purple-500/80", "bg-zinc-900", "text-purple-300");
    }
    btn.classList.add("border-purple-500/80", "bg-zinc-900", "text-purple-300");
  };

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
  if (ep) {
    const m = /^S(\d+)E(\d+)$/.exec(ep);
    if (m) {
      const match = list.querySelector(
        `.episode-btn[data-season="${m[1]}"][data-episode="${m[2]}"]`,
      );
      if (match) markActive(match);
    }
  }
});
