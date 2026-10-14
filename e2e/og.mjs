// Renders public/og.png (1200×630), the preview shown when the site is shared on X, LinkedIn, etc.
import { chromium } from 'playwright';

const font = new URL('../node_modules/@fontsource-variable/inter/files/inter-latin-opsz-normal.woff2', import.meta.url).href;
const tiles = [
  ['G', 'GitHub', '482 913', '#d6e4ff', '#1e3a8a'],
  ['S', 'Stripe', '506 946', '#e1f5d6', '#2f5d1a'],
  ['A', 'AWS', '365 413', '#d4f4f1', '#14524c'],
];
const html = `<!doctype html><html><head><style>
@font-face { font-family: Inter; src: url(${font}) format('woff2'); font-weight: 100 900; }
* { box-sizing: border-box; margin: 0; }
body { width: 1200px; height: 630px; font-family: Inter; background: #fff; color: #141414; padding: 72px 80px; display: flex; flex-direction: column; justify-content: space-between; }
.top { display: flex; align-items: center; gap: 14px; font-size: 30px; font-weight: 650; letter-spacing: -0.02em; }
.top svg { width: 44px; height: 44px; }
.pill { margin-left: auto; font-size: 22px; font-weight: 600; background: #f3f3f3; padding: 10px 20px; border-radius: 999px; }
h1 { font-size: 84px; line-height: 1; font-weight: 650; letter-spacing: -0.04em; max-width: 1000px; }
.row { display: flex; gap: 16px; }
.tile { display: flex; align-items: center; gap: 16px; flex: 1; padding: 20px 22px; border-radius: 24px; background: #f3f3f3; }
.icon { width: 52px; height: 52px; border-radius: 30%; display: grid; place-items: center; font-size: 22px; font-weight: 650; }
.name { font-size: 20px; font-weight: 600; }
.code { margin-left: auto; font-size: 34px; font-weight: 650; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; }
.foot { display: flex; justify-content: space-between; font-size: 22px; color: #6b6b6b; }
.foot b { color: #141414; font-weight: 600; }
</style></head><body>
<div class="top"><svg viewBox="0 0 32 32"><rect width="32" height="32" rx="10" fill="#141414"/><path d="M16 7.5a8.5 8.5 0 1 1-8.5 8.5" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/><circle cx="16" cy="16" r="2.6" fill="#fff"/></svg>Tick<span class="pill">Free · Private · Offline</span></div>
<h1>Your 2FA codes, one keystroke away.</h1>
<div class="row">${tiles.map(([i, n, c, bg, fg]) => `<div class="tile"><span class="icon" style="background:${bg};color:${fg}">${i}</span><span class="name">${n}</span><span class="code">${c}</span></div>`).join('')}</div>
<div class="foot"><span><b>tickcodes.metricdeck.app</b></span><span>A free tool by <b>MetricDeck</b></span></div>
</body></html>`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: new URL('../public/og.png', import.meta.url).pathname });
await browser.close();
