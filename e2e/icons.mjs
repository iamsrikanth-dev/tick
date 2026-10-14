// Renders public/icon.svg to the PNG sizes the manifest and iOS need.
import { launchChromium } from './browser.mjs';
import { readFileSync } from 'node:fs';

const svg = readFileSync(new URL('../public/icon.svg', import.meta.url), 'utf8');
const browser = await launchChromium();
for (const size of [180, 192, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<style>html,body{margin:0;background:transparent}</style>${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}`);
  await page.screenshot({ path: new URL(`../public/icon-${size}.png`, import.meta.url).pathname, omitBackground: true });
  await page.close();
}
await browser.close();
