// End-to-end check of the production build in Chromium: setup, adding accounts (link, image,
// Google Authenticator transfer), copying, search, edit, delete + undo, lock/unlock, persistence,
// backup download and erase. Also fails on any CSP violation or page error.
//
// Usage: npm run build && npm run e2e   (screenshots land in e2e/screenshots)

import { spawn } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchChromium } from './browser.mjs';
import QRCode from 'qrcode';

const PORT = 4179;
const BASE = `http://localhost:${PORT}`;
const SHOTS = new URL('./screenshots/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });

const SECRET = 'JBSWY3DPEHPK3PXP';
const PASSWORD = 'correct horse battery';

function base32ToBuffer(s) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, value = 0;
  const out = [];
  for (const c of s) {
    value = (value << 5) | alphabet.indexOf(c);
    bits += 5;
    if (bits >= 8) { bits -= 8; out.push((value >>> bits) & 255); }
  }
  return Buffer.from(out);
}
function totp(secret, t = Date.now(), digits = 6, period = 30) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(t / 1000 / period)));
  const mac = createHmac('sha1', base32ToBuffer(secret)).update(counter).digest();
  const o = mac[mac.length - 1] & 15;
  return String((mac.readUInt32BE(o) & 0x7fffffff) % 10 ** digits).padStart(digits, '0');
}

// Google Authenticator transfer payload with two accounts.
function varint(n) { const o = []; while (n > 127) { o.push((n & 127) | 128); n = Math.floor(n / 128); } o.push(n); return o; }
const field = (num, bytes) => [...varint(num * 8 + 2), ...varint(bytes.length), ...bytes];
const int = (num, v) => [...varint(num * 8), ...varint(v)];
function migrationUri(entries) {
  const payload = [];
  for (const e of entries) {
    payload.push(...field(1, [...field(1, [...base32ToBuffer(e.secret)]), ...field(2, [...Buffer.from(e.name)]), ...field(3, [...Buffer.from(e.issuer)]), ...int(4, 1), ...int(5, 1), ...int(6, 2)]));
  }
  payload.push(...int(2, 1), ...int(3, 1), ...int(4, 0));
  return `otpauth-migration://offline?data=${encodeURIComponent(Buffer.from(payload).toString('base64'))}`;
}

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `  ${detail}`}`);
  if (!ok) failures++;
}

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
await new Promise((resolve, reject) => {
  server.stdout.on('data', (d) => String(d).includes(String(PORT)) && resolve());
  server.on('exit', () => reject(new Error('preview server exited')));
  setTimeout(() => reject(new Error('preview server timeout')), 20000);
});

const browser = await launchChromium();
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, colorScheme: 'light', acceptDownloads: true });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  const page = await context.newPage();
  const problems = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || /Content Security Policy/i.test(m.text())) problems.push(m.text());
  });
  page.on('pageerror', (e) => problems.push(String(e)));

  // --- Landing page: SEO essentials, links, and no CSP violations ---
  await page.goto(BASE + '/');
  await page.waitForTimeout(1500);
  const seo = await page.evaluate(() => ({
    title: document.title,
    description: document.querySelector('meta[name="description"]')?.getAttribute('content') ?? '',
    canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href'),
    ogImage: document.querySelector('meta[property="og:image"]')?.getAttribute('content'),
    h1: document.querySelectorAll('h1').length,
    jsonld: [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => {
      try { return JSON.parse(s.textContent)['@graph'].map((n) => n['@type']); } catch { return 'invalid'; }
    }),
    faqs: document.querySelectorAll('.l-faq details').length,
    appLinks: document.querySelectorAll('a[href="/app"]').length,
    mdLinks: [...document.querySelectorAll('a[href^="https://metricdeck.app/"]')].every((a) => a.href.includes('utm_source=tickcodes')),
  }));
  check('landing has title, description, canonical and share image', seo.title.length > 30 && seo.title.length <= 70 && seo.description.length >= 120 && seo.description.length <= 170 && seo.canonical === 'https://tickcodes.metricdeck.app/' && !!seo.ogImage, JSON.stringify(seo));
  check('landing has one h1 and valid structured data', seo.h1 === 1 && JSON.stringify(seo.jsonld) === JSON.stringify([['Organization', 'WebApplication', 'FAQPage']]), JSON.stringify(seo.jsonld));
  check('landing links to the app and to MetricDeck with tracking', seo.faqs === 7 && seo.appLinks >= 3 && seo.mdLinks, JSON.stringify(seo));
  for (const path of ['/robots.txt', '/sitemap.xml', '/og.png']) {
    const res = await page.request.get(BASE + path);
    check(`${path} is served`, res.ok());
  }
  await page.screenshot({ path: SHOTS + '00-landing.png' });
  await page.locator('#security').scrollIntoViewIfNeeded();
  await page.waitForTimeout(1600);
  await page.screenshot({ path: SHOTS + '00b-landing-security.png' });
  await page.locator('#metricdeck').scrollIntoViewIfNeeded();
  await page.waitForTimeout(1600);
  await page.screenshot({ path: SHOTS + '00c-landing-metricdeck.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(600);
  await page.screenshot({ path: SHOTS + '00d-landing-mobile.png' });
  check('landing has no horizontal scroll at 390 px', !(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)));
  await page.setViewportSize({ width: 1280, height: 860 });

  // --- Setup ---
  await page.goto(BASE + '/app');
  await page.getByRole('button', { name: 'Get Started' }).waitFor();
  await page.waitForTimeout(800);
  await page.screenshot({ path: SHOTS + '01-welcome.png' });
  await page.getByRole('button', { name: 'Get Started' }).click();
  await page.getByLabel('Master password', { exact: true }).fill('short');
  await page.getByLabel('Confirm password').fill('short');
  await page.getByRole('button', { name: 'Create Vault' }).click();
  check('rejects a short password', await page.getByText('Use at least 8 characters.').isVisible());
  await page.getByLabel('Master password', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Confirm password').fill(PASSWORD);
  await page.screenshot({ path: SHOTS + '02-password.png' });
  await page.getByRole('button', { name: 'Create Vault' }).click();
  await page.getByRole('heading', { name: 'Add your first code' }).waitFor({ timeout: 15000 });
  check('creates the vault and shows the empty state', true);
  await page.waitForTimeout(400);
  await page.screenshot({ path: SHOTS + '03-empty.png' });

  // --- Add by link ---
  await page.getByRole('button', { name: 'Paste Link' }).click();
  await page.getByLabel('Setup link').fill(`otpauth://totp/GitHub:srikanth%40example.com?secret=${SECRET}&issuer=GitHub`);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Add GitHub' }).waitFor();
  await page.waitForTimeout(700);
  await page.screenshot({ path: SHOTS + '04-review-single.png' });
  const preview = await page.locator('.preview-code .odo').getAttribute('aria-label');
  const expected = totp(SECRET);
  check('preview shows the correct current code', preview?.replace(' ', '') === expected || preview?.replace(' ', '') === totp(SECRET, Date.now() - 2000), `${preview} vs ${expected}`);
  await page.getByRole('button', { name: 'Add GitHub' }).click();
  await page.locator('.card-wrap').first().waitFor();
  check('adds the account to the list', (await page.locator('.card-wrap').count()) === 1);

  // --- Add a Google Authenticator transfer QR by image ---
  const gaUri = migrationUri([
    { secret: 'KRSXG5CTMVRXEZLU', name: 'alice@acme.com', issuer: 'Slack' },
    { secret: 'MFRGGZDFMZTWQ2LK', name: 'Dropbox:alice', issuer: '' },
  ]);
  const qrPath = SHOTS + 'ga-transfer.png';
  writeFileSync(qrPath, await QRCode.toBuffer(gaUri, { width: 420, margin: 2 }));
  await page.getByRole('button', { name: 'Add account' }).first().click();
  await page.getByRole('button', { name: 'Image' }).click();
  await page.locator('input[type=file]').setInputFiles(qrPath);
  await page.getByRole('button', { name: 'Add 2 Accounts' }).waitFor({ timeout: 10000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: SHOTS + '05-review-transfer.png' });
  await page.getByRole('button', { name: 'Add 2 Accounts' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.card-wrap').length === 3);
  const names = await page.locator('.card .issuer').allTextContents();
  check('imports the Google Authenticator transfer QR', JSON.stringify(names) === JSON.stringify(['Dropbox', 'GitHub', 'Slack']), JSON.stringify(names));

  // --- Duplicates are skipped ---
  await page.getByRole('button', { name: 'Add account' }).first().click();
  await page.getByRole('button', { name: 'Link' }).click();
  await page.getByLabel('Setup link').fill(`otpauth://totp/GitHub:dupe?secret=${SECRET}`);
  await page.getByRole('button', { name: 'Continue' }).click();
  check('flags an account that is already there', await page.getByText('This account is already in Tick.').waitFor({ timeout: 5000 }).then(() => true, () => false));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  // --- Typing in a form survives the once-a-second refresh (focus must not jump) ---
  await page.getByRole('button', { name: 'Add account' }).first().click();
  await page.getByRole('button', { name: 'Key' }).click();
  await page.locator('.sheet').getByLabel('Service', { exact: true }).click();
  await page.keyboard.type('Pro');
  await page.waitForTimeout(2300);
  await page.keyboard.type('ton');
  await page.locator('.sheet').getByLabel('Account', { exact: true }).click();
  await page.keyboard.type('me@');
  await page.waitForTimeout(2300);
  await page.keyboard.type('proton.me');
  const formState = await page.evaluate(() => ({
    focused: document.activeElement?.closest('label')?.textContent?.trim().slice(0, 7),
    values: [...document.querySelectorAll('.sheet input')].slice(0, 2).map((i) => i.value),
  }));
  check('focus and text stay put while codes tick', formState.focused === 'Account' && formState.values.join('|') === 'Proton|me@proton.me', JSON.stringify(formState));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  // --- Codes on the list match RFC 6238 ---
  const listCode = (await page.locator('.card-wrap', { hasText: 'GitHub' }).locator('.odo').getAttribute('aria-label'))?.replace(' ', '');
  check('list code matches an independent TOTP implementation', listCode === totp(SECRET) || listCode === totp(SECRET, Date.now() - 2000), `${listCode} vs ${totp(SECRET)}`);
  await page.screenshot({ path: SHOTS + '06-list.png' });
  // The last five seconds of a cycle show the next code and switch to the warning color.
  await page.locator('.code.ending').first().waitFor({ timeout: 32000 });
  await page.waitForTimeout(400);
  check('shows the next code near the end of a cycle', (await page.locator('.next span').count()) === 3);
  await page.screenshot({ path: SHOTS + '06b-list-ending.png' });

  // --- Type to search, Enter to copy ---
  await page.locator('body').click({ position: { x: 5, y: 600 } });
  await page.keyboard.type('sla');
  await page.waitForFunction(() => document.querySelectorAll('.card-wrap').length === 1);
  check('typing anywhere searches', (await page.locator('.search input').first().inputValue()) === 'sla');
  await page.keyboard.press('Enter');
  await page.getByText('Copied Slack code').waitFor();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  check('Enter copies the selected code', clip === totp('KRSXG5CTMVRXEZLU') || clip === totp('KRSXG5CTMVRXEZLU', Date.now() + 30000) || clip === totp('KRSXG5CTMVRXEZLU', Date.now() - 2000), `${clip}`);
  await page.screenshot({ path: SHOTS + '07-search-copied.png' });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.querySelectorAll('.card-wrap').length === 3);

  // --- Edit, delete, undo ---
  await page.locator('.card-wrap', { hasText: 'Dropbox' }).hover();
  await page.getByRole('button', { name: 'Edit Dropbox' }).click();
  await page.getByLabel('Service').fill('Dropbox Work');
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await page.locator('.card-wrap', { hasText: 'Dropbox Work' }).waitFor();
  check('renames an account', true);
  await page.getByRole('button', { name: 'Edit Dropbox Work' }).click({ force: true });
  await page.getByRole('button', { name: 'Delete Account' }).click();
  await page.screenshot({ path: SHOTS + '08-delete-confirm.png' });
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.card-wrap').length === 2);
  await page.getByRole('button', { name: 'Undo' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.card-wrap').length === 3);
  check('deletes with confirmation and undo restores it', true);

  // --- Settings ---
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: '15 min' }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: SHOTS + '09-settings.png' });
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Download encrypted backup/ }).click()]);
  const backupPath = SHOTS + 'backup.json';
  await download.saveAs(backupPath);
  const backup = JSON.parse(await (await import('node:fs/promises')).readFile(backupPath, 'utf8'));
  check('backup is encrypted', backup.app === 'tick' && !JSON.stringify(backup).includes(SECRET));
  await page.keyboard.press('Escape');

  // --- Lock, wrong password, unlock, persistence ---
  await page.getByRole('button', { name: 'Lock' }).click();
  await page.getByRole('heading', { name: 'Welcome back.' }).waitFor();
  await page.getByLabel('Master password', { exact: true }).fill('wrong password');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await page.getByText('That password isn’t right. Try again.').waitFor({ timeout: 15000 });
  check('rejects a wrong password', true);
  await page.screenshot({ path: SHOTS + '10-locked-error.png' });
  await page.reload();
  await page.getByLabel('Master password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Unlock' }).click();
  await page.locator('.card-wrap').first().waitFor({ timeout: 15000 });
  check('accounts persist across reloads', (await page.locator('.card-wrap').count()) === 3);
  await page.getByRole('button', { name: 'Settings' }).click();
  check('settings persist', (await page.getByRole('button', { name: '15 min' }).getAttribute('aria-pressed')) === 'true');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // --- Dark mode and compact layout screenshots ---
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForTimeout(300);
  await page.screenshot({ path: SHOTS + '11-list-dark.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: SHOTS + '12-mobile-dark.png' });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.waitForTimeout(300);
  await page.screenshot({ path: SHOTS + '13-mobile-light.png' });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  check('no horizontal scrolling at 390 px', !overflow);
  await page.getByRole('button', { name: 'Add account' }).last().click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: SHOTS + '14-mobile-add-sheet.png' });
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1280, height: 860 });

  // --- Erase ---
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Erase Tick on this browser' }).click();
  await page.getByRole('button', { name: 'Erase Everything' }).click();
  await page.getByRole('button', { name: 'Get Started' }).waitFor();
  check('erase returns to setup', true);

  // --- Restore from the backup into a fresh vault ---
  await page.getByRole('button', { name: 'Get Started' }).click();
  await page.getByLabel('Master password', { exact: true }).fill('another password 42');
  await page.getByLabel('Confirm password').fill('another password 42');
  await page.getByRole('button', { name: 'Create Vault' }).click();
  await page.getByRole('heading', { name: 'Add your first code' }).waitFor({ timeout: 15000 });
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.locator('input[type=file]').last().setInputFiles(backupPath);
  await page.getByLabel('Backup password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Restore Accounts' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.card-wrap').length === 3, null, { timeout: 15000 });
  check('restores an encrypted backup into a new vault', true);

  check('no console errors or CSP violations', problems.length === 0, problems.join('\n'));
} catch (error) {
  failures++;
  console.error('✗ run aborted:', error);
} finally {
  await browser.close();
  server.kill();
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
