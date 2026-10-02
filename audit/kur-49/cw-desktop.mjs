import { chromium } from '../kur-32/node_modules/playwright/index.mjs';
const BASE = 'https://videasy.kurulabs.dpdns.org';
const browser = await chromium.launch({ executablePath: '/Users/user/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell' });
const p = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
await p.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 45000 });
await p.evaluate(() => {
  const now = Date.now();
  localStorage.setItem('videasy:cw.v1', JSON.stringify([
    { imdbId: 'tt0113277', tmdbId: '949', type: 'movie', title: 'Heat', runtimeMin: 170, positionSec: 5400, durationSec: 10200, progress: 0.53, startedAt: now, updatedAt: now },
  ]));
});
await p.reload({ waitUntil: 'networkidle' });
await p.waitForTimeout(1000);
const r = await p.evaluate(() => {
  const doc = document.documentElement;
  const card = document.querySelector('#cw-list .cw-card');
  const b = card?.getBoundingClientRect();
  return {
    rowVisible: !document.getElementById('cw-row')?.classList.contains('hidden'),
    cardWidth: b ? Math.round(b.width) : null,
    overflow: doc.scrollWidth - doc.clientWidth > 1,
    subline: document.querySelector('#cw-list .cw-sub')?.textContent ?? null,
    remove: (() => { const t = document.querySelector('#cw-list .cw-remove')?.getBoundingClientRect(); return t ? `${Math.round(t.width)}x${Math.round(t.height)}` : null; })(),
  };
});
console.log(JSON.stringify({ ...r, jsErrors: errors.length }, null, 2));
await browser.close();
