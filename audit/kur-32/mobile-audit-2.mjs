// KUR-32 audit pass 2: corrected selectors + post-play interaction geometry.
import { chromium } from 'playwright';

const BASE = 'https://videasy.kurulabs.dpdns.org';
const PAGES = [
  { label: 'movie-heat', url: '/title/tt0113277' },
  { label: 'series-bb', url: '/tv/tt0903747' },
];
const WIDTHS = [375, 390, 414, 768];
const EXE = '/Users/user/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell';

const browser = await chromium.launch({ executablePath: EXE });
const out = {};

for (const page of PAGES) {
  out[page.label] = {};
  for (const width of WIDTHS) {
    const ctx = await browser.newContext({
      viewport: { width, height: 800 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    const p = await ctx.newPage();
    await p.goto(BASE + page.url, { waitUntil: 'networkidle', timeout: 45000 });
    await p.waitForTimeout(1000);

    const data = await p.evaluate(() => {
      const doc = document.documentElement;
      const r = { overflow: doc.scrollWidth - doc.clientWidth > 1 ? `YES ${doc.scrollWidth}` : 'no' };
      const rect = (e) => {
        if (!e) return null;
        const b = e.getBoundingClientRect();
        return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
      };
      const imgs = [...document.querySelectorAll('main img')];
      const backdrop = imgs.find((i) => (i.className || '').includes('opacity-25'));
      const poster = imgs.find((i) => i !== backdrop);
      r.backdrop = rect(backdrop);
      r.backdropOpacity = backdrop ? getComputedStyle(backdrop).opacity : null;
      r.backdropLoaded = backdrop ? backdrop.naturalWidth > 0 : null;
      r.poster = rect(poster);
      r.posterLoaded = poster ? poster.naturalWidth > 0 : null;

      // all interactive targets, flag anything under 44x44
      r.targets = [];
      for (const a of document.querySelectorAll('main a, main button, main select, header a, header button')) {
        const b = a.getBoundingClientRect();
        if (b.width === 0 || b.height === 0) continue;
        r.targets.push({
          kind: a.tagName.toLowerCase(),
          label: (a.getAttribute('aria-label') || a.textContent || a.id || '').trim().slice(0, 34),
          w: Math.round(b.width),
          h: Math.round(b.height),
          under44: b.width < 44 || b.height < 44,
        });
      }

      // contrast estimate for h1 zone: sample computed styles only (static check)
      const h1 = document.querySelector('h1');
      r.h1 = rect(h1);
      r.h1Size = getComputedStyle(h1).fontSize;
      const seasonSel = document.querySelector('#season-select');
      r.seasonSelect = rect(seasonSel);
      const epList = document.querySelector('#episode-list');
      r.epListCols = epList ? getComputedStyle(epList).gridTemplateColumns.split(' ').length : 0;
      r.epFirst = rect(epList?.querySelector('.episode-btn'));
      return r;
    });

    // post-play: click play, measure live player + server buttons
    try {
      await p.click('[data-watch-panel] button', { timeout: 5000 });
      await p.waitForSelector('iframe[title="Video player"]', { timeout: 15000 });
      await p.waitForTimeout(2500);
      data.afterPlay = await p.evaluate(() => {
        const doc = document.documentElement;
        const rect = (e) => {
          if (!e) return null;
          const b = e.getBoundingClientRect();
          return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
        };
        const ifr = document.querySelector('iframe[title="Video player"]');
        const wrap = ifr?.parentElement;
        const r = {
          overflowAfter: doc.scrollWidth - doc.clientWidth > 1 ? `YES ${doc.scrollWidth}` : 'no',
          iframe: rect(ifr),
          iframeSrc: ifr?.src?.slice(0, 60) || null,
          wrapAspect: null,
          serverButtons: [],
        };
        if (wrap) {
          const b = wrap.getBoundingClientRect();
          r.wrapAspect = +(b.width / b.height).toFixed(3);
        }
        for (const btn of document.querySelectorAll('button')) {
          if (/videasy|vidlink|vidsrc/i.test(btn.textContent || '')) {
            const b = btn.getBoundingClientRect();
            r.serverButtons.push({ label: btn.textContent.trim(), w: Math.round(b.width), h: Math.round(b.height), under44: b.width < 44 || b.height < 44 });
          }
        }
        return r;
      });
      await p.screenshot({ path: `shots/${page.label}-${width}-playing.png`, fullPage: false });
    } catch (e) {
      data.afterPlay = { error: String(e).slice(0, 120) };
    }
    await p.screenshot({ path: `shots/${page.label}-${width}-top.png`, fullPage: false });
    out[page.label][width] = data;
    await ctx.close();
  }
}
await browser.close();
console.log(JSON.stringify(out, null, 1));
