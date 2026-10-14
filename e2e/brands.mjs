// Writes the brand logos used in the landing page's example tiles to public/brands/*.svg,
// from the Iconify "logos" set (bundled locally; the CSP allows no outside requests).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const set = JSON.parse(readFileSync(new URL('../node_modules/@iconify-json/logos/icons.json', import.meta.url), 'utf8'));
const icons = {
  github: 'github-icon',
  google: 'google-icon',
  aws: 'aws',
  stripe: 'stripe',
  figma: 'figma',
  notion: 'notion-icon',
  vercel: 'vercel-icon',
  discord: 'discord-icon',
  cloudflare: 'cloudflare-icon',
  linear: 'linear-icon',
  slack: 'slack-icon',
  dropbox: 'dropbox',
};

const out = new URL('../public/brands/', import.meta.url);
mkdirSync(out, { recursive: true });
for (const [file, name] of Object.entries(icons)) {
  const icon = set.icons[name];
  const width = icon.width ?? set.width ?? 16;
  const height = icon.height ?? set.height ?? 16;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${icon.left ?? 0} ${icon.top ?? 0} ${width} ${height}">${icon.body}</svg>\n`;
  writeFileSync(new URL(`${file}.svg`, out), svg);
}
console.log(`Wrote ${Object.keys(icons).length} logos to public/brands/`);
