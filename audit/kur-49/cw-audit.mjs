// KUR-49 US-1 audit: seed videasy:cw.v1 in a mobile viewport, verify the
// continue-watching row renders, deep-links carry progress+s+ep, remove
// control is a 44px target, and no horizontal overflow at 375px.
import { chromium } from '../kur-32/node_modules/playwright/index.mjs';

const BASE = 'http://127.0.0.1:4600';
const browser = await chromium.launch({ executablePath: '/Users/user/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell' });
const ctx = await browser.newContext({
  viewport: { width: 375, height: 800 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
p.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

await p.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 45000 });
await p.evaluate(() => {
  const now = Date.now();
  localStorage.setItem('videasy:cw.v1', JSON.stringify([
    { imdbId: 'tt0903747', tmdbId: '1396', type: 'tv', title: 'Breaking Bad', season: 2, episode: 5, episodeTitle: 'Mango', runtimeMin: 47, positionSec: 1020, durationSec: 2820, progress: 0.36, startedAt: now - 86400000, updatedAt: now - 3600000 },
    { imdbId: 'tt0113277', tmdbId: '949', type: 'movie', title: 'Heat', runtimeMin: 170, positionSec: 5400, durationSec: 10200, progress: 0.53, startedAt: now - 172800000, updatedAt: now - 7200000 },
  ]));
});
await p.reload({ waitUntil: 'networkidle' });
await p.waitForTimeout(1200);

const data = await p.evaluate(() => {
  const r = {};
  const row = document.getElementById('cw-row');
  r.rowVisible = !!row && !row.classList.contains('hidden');
  r.cardCount = document.querySelectorAll('#cw-list .cw-card').length;
  r.firstHref = document.querySelector('#cw-list .cw-card a')?.getAttribute('href') ?? null;
  const remove = document.querySelector('#cw-list .cw-remove');
  if (remove) {
    const b = remove.getBoundingClientRect();
    r.removeTarget = `${Math.round(b.width)}x${Math.round(b.height)}`;
  }
  const doc = document.documentElement;
  r.hasHorizontalOverflow = doc.scrollWidth - doc.clientWidth > 1;
  r.progressBar = document.querySelector('#cw-list .cw-progress')?.getAttribute('style') ?? null;
  r.subline = document.querySelector('#cw-list .cw-sub')?.textContent ?? null;
  return r;
});

// Deep link: click the first card, expect navigation to the title page.
await p.click('#cw-list .cw-card a');
await p.waitForLoadState('networkidle');
await p.waitForTimeout(800);
data.deepLinkLandsOn = p.url().replace(BASE, '');

// Hero relabel check on that landed page (store still seeded).
data.heroLabel = await p.evaluate(() => document.getElementById('hero-play-label')?.textContent ?? null);
data.heroHref = await p.evaluate(() => document.getElementById('hero-play')?.getAttribute('href') ?? null);

data.errors = errors;
console.log(JSON.stringify(data, null, 2));
await browser.close();
