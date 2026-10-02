// KUR-55 US-4/US-5 audit (375px mobile + 1280px desktop) against the local
// preview build. Verifies:
//  US-4  - episode rows render 16:9 stills w/ E-number fallback
//        - ?ep= deep link highlights the right row + URL param respected
//        - CW entry (seeded) highlights its episode
//        - watched state (seeded episode key in watched.v1) dims row + amber check
//        - next-episode chip: hidden early in playback; visible after a seeded
//          relay sample in the final 90s; click swaps Player target to E6
//        - chip 44px target
//  US-5  - sticky bar hidden at top; visible after scrolling past hero
//        - 56px bar, 44px CTA, label/href synced from hero (incl. Resume)
//  US-1 regression - cw row still renders on home
import { chromium } from '../kur-32/node_modules/playwright/index.mjs';

const BASE = 'http://127.0.0.1:4600';
const browser = await chromium.launch({ executablePath: '/Users/user/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell' });

const results = { mobile: {}, desktop: {}, errors: [] };

async function newPage(viewport, isMobile) {
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: isMobile ? 3 : 1,
    isMobile,
    hasTouch: isMobile,
  });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => results.errors.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') results.errors.push('console: ' + m.text()); });
  return p;
}

function seed() {
  const now = Date.now();
  localStorage.setItem('videasy:cw.v1', JSON.stringify([
    // S2E5 in progress -> highlights E5 on /tv/tt0903747 (deep-link path)
    { imdbId: 'tt0903747', tmdbId: '1396', type: 'tv', title: 'Breaking Bad', season: 2, episode: 5, episodeTitle: 'Mango', runtimeMin: 47, positionSec: 600, durationSec: 2820, progress: 0.21, startedAt: now - 86400000, updatedAt: now - 3600000 },
  ]));
  localStorage.setItem('videasy:watched.v1', JSON.stringify(['tt0903747-s2e2']));
}

// ---------- MOBILE 375 ----------
const m = await newPage({ width: 375, height: 800 }, true);

// Home: CW row regression
await m.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 45000 });
await m.evaluate(seed);
await m.reload({ waitUntil: 'networkidle' });
await m.waitForTimeout(800);
results.mobile.cwRowCards = await m.evaluate(() => document.querySelectorAll('#cw-list .cw-card').length);

// Detail: stills, watched, CW highlight
await m.goto(BASE + '/tv/tt0903747?s=2', { waitUntil: 'networkidle' });
await m.waitForTimeout(800);
results.mobile.episodes = await m.evaluate(() => {
  const rows = [...document.querySelectorAll('#episode-list .episode-btn')];
  return {
    count: rows.length,
    stills: rows.filter((r) => r.querySelector('span[style*="aspect-ratio"]')).length,
    watched: rows.filter((r) => r.querySelector('.ep-watched-check:not(.hidden)')).length,
    cwHighlighted: rows.filter((r) => r.classList.contains('border-purple-500/80'))
      .map((r) => r.getAttribute('data-episode')),
  };
});

// Sticky: hidden at top -> visible after scroll; sync from hero (Resume)
results.mobile.stickyAtTop = await m.evaluate(() => document.getElementById('sticky-header')?.dataset.stickyState ?? 'missing');
await m.evaluate(() => document.getElementById('episode-list')?.scrollIntoView({ block: 'end' }));
await m.waitForTimeout(500);
results.mobile.stickyAfterScroll = await m.evaluate(() => {
  const bar = document.getElementById('sticky-header');
  if (!bar) return { state: 'missing' };
  const cta = document.getElementById('sticky-play');
  const box = cta?.getBoundingClientRect();
  return {
    state: bar.dataset.stickyState,
    barH: bar.getBoundingClientRect().height,
    ctaSize: box ? `${Math.round(box.width)}x${Math.round(box.height)}` : null,
    label: document.getElementById('sticky-play-label')?.textContent,
    href: cta?.getAttribute('href'),
  };
});

// Overflow check
results.mobile.hasHorizontalOverflow = await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth > 1);

// Next-episode chip: not visible before playback (Player not mounted yet)
results.mobile.chipHiddenEarly = await m.evaluate(() => !document.querySelector('[data-next-episode]'));

// Start playback (mounts Player for S2E5) via the pre-play surface.
await m.evaluate(() => document.querySelector('[data-watch-panel] button')?.click());
await m.waitForTimeout(1000);

// Fire a synthetic PLAYER_EVENT sample inside the final 90s (2760/2820s =
// 60s left) by dispatching the same postMessage shape the embed uses; the
// relay listens on window. Wait a tick for the throttled write + chip render.
await m.evaluate(() => {
  window.dispatchEvent(new MessageEvent('message', {
    origin: 'https://player.videasy.net',
    data: JSON.stringify({
      type: 'PLAYER_EVENT',
      data: { event: 'timeupdate', timestamp: 2760, duration: 2820, type: 'tv', id: '1396', season: 2, episode: 5 },
    }),
  }));
});
await m.waitForTimeout(600);
results.mobile.chipAfterLateSample = await m.evaluate(() => {
  const chip = document.querySelector('[data-next-episode]');
  if (!chip) return null;
  const box = chip.getBoundingClientRect();
  return {
    text: chip.textContent.replace(/\s+/g, ' ').trim(),
    target: box.width >= 43 && box.height >= 43 ? '44px-ok' : `${Math.round(box.width)}x${Math.round(box.height)}`,
  };
});

// Click the chip -> Player target swaps to S2E6 (iframe key + label change).
if (results.mobile.chipAfterLateSample) {
  await m.click('[data-next-episode]');
  await m.waitForTimeout(800);
  results.mobile.chipClickSwaps = await m.evaluate(() => {
    const label = [...document.querySelectorAll('[data-watch-panel] span')]
      .map((s) => s.textContent)
      .find((t) => t && t.includes('S2E6'));
    return label ? `now-playing: ${label.trim()}` : 'no S2E6 label found';
  });
}

// ?ep= deep link highlight (fresh load)
await m.goto(BASE + '/tv/tt0903747?s=2&ep=S2E3', { waitUntil: 'networkidle' });
await m.waitForTimeout(600);
results.mobile.deepLinkE3 = await m.evaluate(() =>
  [...document.querySelectorAll('#episode-list .episode-btn')]
    .filter((r) => r.classList.contains('border-purple-500/80'))
    .map((r) => r.getAttribute('data-episode')),
);

await m.close();

// ---------- DESKTOP 1280 ----------
const d = await newPage({ width: 1280, height: 900 }, false);
await d.goto(BASE + '/tv/tt0903747?s=2', { waitUntil: 'networkidle' });
await d.waitForTimeout(800);
results.desktop.stickyAfterScroll = await d.evaluate(async () => {
  document.getElementById('episode-list')?.scrollIntoView({ block: 'end' });
  await new Promise((r) => setTimeout(r, 400));
  return document.getElementById('sticky-header')?.dataset.stickyState ?? 'missing';
});
results.desktop.stickyAtTopAfterBack = await d.evaluate(async () => {
  window.scrollTo({ top: 0 });
  await new Promise((r) => setTimeout(r, 400));
  return document.getElementById('sticky-header')?.dataset.stickyState ?? 'missing';
});
// Movie page: no chip structure errors, sticky works there too
await d.goto(BASE + '/title/tt0113277', { waitUntil: 'networkidle' });
await d.waitForTimeout(600);
results.desktop.moviePage = await d.evaluate(async () => {
  window.scrollTo(0, document.body.scrollHeight);
  await new Promise((r) => setTimeout(r, 500));
  const bar = document.getElementById('sticky-header');
  const hero = document.getElementById('hero-play');
  return {
    state: bar?.dataset.stickyState ?? 'missing',
    label: document.getElementById('sticky-play-label')?.textContent ?? null,
    scrollY: window.scrollY,
    bodyH: document.body.scrollHeight,
    heroTop: hero ? hero.getBoundingClientRect().top : null,
    ioSupport: typeof IntersectionObserver,
  };
});
await d.close();

await browser.close();
console.log(JSON.stringify(results, null, 2));
