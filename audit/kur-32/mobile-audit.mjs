// KUR-32 mobile scaling audit — geometric checks at 375/390/414/768.
// Launches a fresh Chromium and pulls computed geometry + link target audit.
import { chromium } from 'playwright';

const BASE = 'https://videasy.kurulabs.dpdns.org';
const PAGES = [
  { label: 'movie Heat', url: '/title/tt0113277' },
  { label: 'series Breaking Bad', url: '/tv/tt0903747' },
];
const WIDTHS = [375, 390, 414, 768];

const browser = await chromium.launch({ executablePath: '/Users/user/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell' });
const report = {};

for (const page of PAGES) {
  report[page.label] = {};
  for (const width of WIDTHS) {
    const ctx = await browser.newContext({
      viewport: { width, height: 800 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    });
    const p = await ctx.newPage();
    const errors = [];
    p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    p.on('console', (m) => {
      if (m.type() === 'error') errors.push('console: ' + m.text());
    });
    await p.goto(BASE + page.url, { waitUntil: 'networkidle', timeout: 45000 });
    await p.waitForTimeout(1200); // island hydration

    const data = await p.evaluate(() => {
      const r = {};
      const doc = document.documentElement;
      r.hasHorizontalOverflow =
        doc.scrollWidth - doc.clientWidth > 1
          ? `YES overflow=${doc.scrollWidth}>client=${doc.clientWidth}`
          : 'no';
      r.metaViewport = document.querySelector('meta[name="viewport"]')?.content || 'MISSING';

      const el = (sel) => document.querySelector(sel);
      const rectOf = (sel) => {
        const e = el(sel);
        if (!e) return null;
        const b = e.getBoundingClientRect();
        return {
          x: Math.round(b.x),
          y: Math.round(b.y),
          w: Math.round(b.width),
          h: Math.round(b.height),
        };
      };
      r.h1 = rectOf('h1');
      r.poster = rectOf('main img:not([aria-hidden="true"])');
      r.backdrop = rectOf('img[aria-hidden="true"]');
      r.playBtn = rectOf('[data-watch-panel] button');
      r.watchPanel = rectOf('[data-watch-panel]');
      r.seasonSelect = rectOf('#season-select');
      r.episodeFirst = rectOf('#episode-list .episode-btn');

      // Text contrast: h1 over backdrop zone
      const h1 = el('h1');
      if (h1) {
        const cs = getComputedStyle(h1);
        r.h1_color = cs.color;
        r.h1_size = cs.fontSize;
      }
      // backdrop effective darkness behind header zone
      const bd = el('img[aria-hidden="true"]');
      r.backdropOpacity = bd ? getComputedStyle(bd).opacity : 'n/a';

      // Touch targets: every a/button inside main
      r.smallTargets = [];
      r.targetCount = 0;
      for (const a of document.querySelectorAll('main a, main button, header a')) {
        const b = a.getBoundingClientRect();
        if (b.width === 0 || b.height === 0) continue;
        r.targetCount++;
        if ((b.width < 44 || b.height < 24) && !(a.textContent || '').trim().match(/^back to search$/i)) {
          r.smallTargets.push({
            tag: a.tagName,
            text: (a.textContent || '').trim().slice(0, 30),
            w: Math.round(b.width),
            h: Math.round(b.height),
          });
        }
      }
      r.smallTargets = r.smallTargets.slice(0, 12);

      // Any element wider than viewport
      r.wideEls = [];
      for (const e of document.querySelectorAll('main *')) {
        const b = e.getBoundingClientRect();
        if (b.width > doc.clientWidth + 2) {
          r.wideEls.push({
            tag: e.tagName + (e.className && typeof e.className === 'string' ? '.' + e.className.split(' ')[0] : ''),
            w: Math.round(b.width),
          });
          if (r.wideEls.length >= 5) break;
        }
      }
      return r;
    });
    data.jsErrors = errors;
    report[page.label][width] = data;
    await ctx.close();
  }
}

await browser.close();
console.log(JSON.stringify(report, null, 1));
