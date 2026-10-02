// KUR-55 US-4 AC3 live probe: return-to-series deep-links the first unwatched
// episode of the rendered season when only finished-episode history exists.
// Scenarios (all live prod, 375px mobile):
//  A. watched.v1 has S2E1..E4 keys, no cw.v1 in-progress entry
//     -> hero CTA becomes "Play S2E5", href ep=S2E5, sticky synced
//  B. explicit ?ep=S2E3 pin -> CTA untouched (pin wins)
//  C. fresh cw.v1 in-progress entry (S2E5 @ 600s) -> cwResumeLabel wins ("Resume")
//  D. season fully watched (E1..E13) -> CTA untouched (default opener)
import { chromium } from '../kur-32/node_modules/playwright/index.mjs';

const BASE = 'https://videasy.kurulabs.dpdns.org';
const browser = await chromium.launch({ executablePath: '/Users/user/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell' });

const results = {};
const ctx = await browser.newContext({ viewport: { width: 375, height: 800 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const p = await ctx.newPage();

async function cta() {
  return p.evaluate(() => ({
    label: document.getElementById('hero-play-label')?.textContent ?? null,
    href: document.getElementById('hero-play')?.getAttribute('href') ?? null,
    stickyLabel: document.getElementById('sticky-play-label')?.textContent ?? null,
    stickyHref: document.getElementById('sticky-play')?.getAttribute('href') ?? null,
  }));
}

// --- A: finished-episode history only -> first unwatched = S2E5
await p.goto(BASE + '/tv/tt0903747?s=2', { waitUntil: 'networkidle', timeout: 45000 });
await p.evaluate(() => {
  const w = []; for (let e = 1; e <= 4; e++) w.push(`tt0903747-s2e${e}`);
  localStorage.setItem('videasy:watched.v1', JSON.stringify(w));
  localStorage.removeItem('videasy:cw.v1');
});
await p.reload({ waitUntil: 'networkidle' });
await p.waitForTimeout(900);
results.a_nextUnwatched = await cta();

// --- B: explicit ?ep pin wins
await p.goto(BASE + '/tv/tt0903747?s=2&ep=S2E3', { waitUntil: 'networkidle' });
await p.waitForTimeout(900);
results.b_pinnedE3 = await cta();

// --- C: in-progress entry -> Resume wins
await p.goto(BASE + '/tv/tt0903747?s=2', { waitUntil: 'networkidle' });
await p.evaluate(() => {
  const now = Date.now();
  localStorage.setItem('videasy:cw.v1', JSON.stringify([
    { imdbId: 'tt0903747', tmdbId: '1396', type: 'tv', title: 'Breaking Bad', season: 2, episode: 5, episodeTitle: 'Mango', runtimeMin: 47, positionSec: 600, durationSec: 2820, progress: 0.21, startedAt: now - 86400000, updatedAt: now - 3600000 },
  ]));
});
await p.reload({ waitUntil: 'networkidle' });
await p.waitForTimeout(900);
results.c_resumeWins = await cta();

// --- D: fully watched season -> untouched
await p.goto(BASE + '/tv/tt0903747?s=2', { waitUntil: 'networkidle' });
await p.evaluate(() => {
  const w = []; for (let e = 1; e <= 13; e++) w.push(`tt0903747-s2e${e}`);
  localStorage.setItem('videasy:watched.v1', JSON.stringify(w));
  localStorage.removeItem('videasy:cw.v1');
});
await p.reload({ waitUntil: 'networkidle' });
await p.waitForTimeout(900);
results.d_fullyWatched = await cta();

await p.close();
await ctx.close();
await browser.close();
console.log(JSON.stringify(results, null, 2));
