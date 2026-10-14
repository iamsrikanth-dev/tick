// Renders public/og.png (1200×630), the preview shown when the site is shared on X, LinkedIn, etc.
import { readFileSync } from 'node:fs';
import { launchChromium } from './browser.mjs';

// Fonts are inlined as data URLs; a page set with setContent can't load file:// fonts.
const fontUrl = (path) => `data:font/woff2;base64,${readFileSync(new URL(path, import.meta.url)).toString('base64')}`;
const display = fontUrl('../node_modules/@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-latin-wght-normal.woff2');
const body = fontUrl('../node_modules/@fontsource-variable/dm-sans/files/dm-sans-latin-opsz-normal.woff2');
const mdIcon = `<svg viewBox="0 0 28 28" width="26" height="26"><rect width="28" height="28" rx="6.3" fill="#4f46e5"/><g transform="translate(1.2492307692307678 1.2492307692307683) scale(0.5312820512820513)"><rect x="4.5" y="26" width="7" height="16" rx="3.5" fill="#bdb8fa"/><rect x="14.5" y="16" width="7" height="26" rx="3.5" fill="#bdb8fa"/><path d="M28 6 H29.5 A14 18 0 0 1 29.5 42 H28 A3.5 3.5 0 0 1 24.5 38.5 V9.5 A3.5 3.5 0 0 1 28 6 Z" fill="#ffffff"/></g></svg>`;
const tiles = [
  ['G', 'GitHub', '482 913', '#d6e4ff', '#1e3a8a'],
  ['S', 'Stripe', '506 946', '#e1f5d6', '#2f5d1a'],
  ['A', 'AWS', '365 413', '#d4f4f1', '#14524c'],
];
const html = `<!doctype html><html><head><style>
@font-face { font-family: Display; src: url(${display}) format('woff2'); font-weight: 200 800; }
@font-face { font-family: Body; src: url(${body}) format('woff2'); font-weight: 100 1000; }
* { box-sizing: border-box; margin: 0; }
body { width: 1200px; height: 630px; font-family: Display; background: #fff; color: #141414; padding: 72px 80px; display: flex; flex-direction: column; justify-content: space-between; }
.top { display: flex; align-items: center; gap: 14px; font-size: 30px; font-weight: 650; letter-spacing: -0.02em; }
.top svg { width: 44px; height: 44px; }
.pill { margin-left: auto; font-size: 22px; font-weight: 600; background: #f3f3f3; padding: 10px 20px; border-radius: 999px; }
h1 { font-size: 80px; line-height: 1.02; font-weight: 700; letter-spacing: -0.035em; max-width: 1000px; }
.row { display: flex; gap: 16px; }
.tile { display: flex; align-items: center; gap: 16px; flex: 1; padding: 20px 22px; border-radius: 24px; background: #f3f3f3; }
.icon { width: 52px; height: 52px; border-radius: 30%; display: grid; place-items: center; font-size: 22px; font-weight: 650; }
.name { font-size: 20px; font-weight: 600; }
.code { margin-left: auto; font-size: 34px; font-weight: 650; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; }
.foot { display: flex; justify-content: space-between; align-items: center; font-family: Body; font-size: 22px; color: #6b6b6b; }
.foot .md { display: inline-flex; align-items: center; gap: 10px; }
.foot b { color: #141414; font-weight: 600; }
</style></head><body>
<div class="top"><svg viewBox="0 0 32 32"><rect width="32" height="32" rx="10" fill="#141414"/><path d="M16 7.5a8.5 8.5 0 1 1-8.5 8.5" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/><circle cx="16" cy="16" r="2.6" fill="#fff"/></svg>Tick<span class="pill">Free · Private · Offline</span></div>
<h1>Your 2FA codes, one keystroke away.</h1>
<div class="row">${tiles.map(([i, n, c, bg, fg]) => `<div class="tile"><span class="icon" style="background:${bg};color:${fg}">${i}</span><span class="name">${n}</span><span class="code">${c}</span></div>`).join('')}</div>
<div class="foot"><span><b>tickcodes.metricdeck.app</b></span><span class="md">A free tool by ${mdIcon}<b>MetricDeck</b></span></div>
</body></html>`;

const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: new URL('../public/og.png', import.meta.url).pathname });
await browser.close();
