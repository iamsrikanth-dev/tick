# Tick

Your two-factor codes, one keystroke away. Tick is a TOTP authenticator that runs in your browser, so
signing in no longer means reaching for your phone.

- **Type to find, Enter to copy.** Start typing anywhere to search; `↑` `↓` choose; `Enter` copies.
- **Add accounts any way:** scan a QR code straight off your screen, scan with the camera, drop or
  paste a screenshot, paste an `otpauth://` link, or type the setup key.
- **Move from your phone:** imports Google Authenticator transfer QR codes, Aegis and 2FAS
  (unencrypted) exports, and lists of `otpauth://` links.
- **Private by design:** everything stays in this browser. No server, no analytics, no third-party
  requests, and a strict Content Security Policy in production.
- **Works offline** and installs as an app (PWA).

## Design

Modeled on Mobbin's visual system: Plus Jakarta Sans for headings, controls and digits, DM Sans
for body text (both self-hosted), ink on white with soft grey surfaces instead
of shadows, pill controls and 24px cards. Light and dark follow the system setting.

Motion uses GSAP for choreography (line-by-line headline reveals with SplitText, staggered card
entrances, the welcome marquee, count-ups, copy and error feedback) and Motion for layout and
presence (search filtering, sheets, toasts). Every animation respects `prefers-reduced-motion`.

## Security model

| What | How |
| --- | --- |
| Vault encryption | AES-256-GCM with a random data key |
| Master password | PBKDF2-SHA256, 600,000 iterations, random 16-byte salt; wraps the data key |
| Storage | One encrypted record in IndexedDB. Nothing readable is ever written to disk |
| In memory | The data key only while unlocked; cleared on lock |
| Auto-lock | After 1, 5, 15 or 60 minutes without activity |
| Clipboard | Copied codes are cleared after 15–60 s (while Tick is the active tab; browsers block clipboard writes in the background) |
| Clock | Compares your clock with the server's `Date` header and corrects codes if it's off by more than 3 s |

Trade-off to know about: two-factor is strongest when the codes live on a different device from
your passwords. Keeping both in one browser is convenient, so protect it with a strong master
password and keep your sites' backup codes somewhere safe. There is no password recovery.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (RFC 4226/6238 vectors, importers, vault crypto)
npm run build      # type-check and build to dist/
npm run e2e        # end-to-end checks against the production build (needs Chromium)
```

`npm run e2e` drives the built app in Chromium through setup, every add path, search, copy, edit,
delete with undo, lock and unlock, backup and restore, and fails on any console error or CSP
violation. It uses `CHROMIUM_PATH` if set, otherwise the Chromium from `npx playwright install chromium`. Screenshots are
written to `e2e/screenshots/`.

## Deploy

`dist/` is a static site. Any static host works; the app needs HTTPS for clipboard, camera and
screen capture.

- **Vercel:** import the repository; `vercel.json` sets the build, output directory, security
  headers (no framing, HSTS, camera and screen capture limited to this site) and cache rules.
- **Netlify / Cloudflare Pages:** build command `npm run build`, output directory `dist`, and copy
  the headers from `vercel.json` into the host's headers file.

## Landing page and MetricDeck

- `/` is a static, crawlable landing page (`index.html`, `src/landing/`) with the SEO metadata,
  share image (`public/og.png`, regenerate with `node e2e/og.mjs`), structured data (app + FAQ),
  `robots.txt` and `sitemap.xml`. The app itself lives at `/app` (`app.html`) and is `noindex`.
- Guides for what people search, at clean paths: `/google-authenticator-on-pc` and
  `/authy-desktop-alternative` (`google-authenticator-on-pc.html`, `authy-desktop-alternative.html`;
  same header, footer, styles and script as the landing page, each with its own title, description,
  canonical and structured data: article, breadcrumb and FAQ). A new guide needs its file, an entry
  in `PAGES` (`vite.config.ts`), a rewrite and redirect in `vercel.json`, a line in `sitemap.xml`
  and `llms.txt`, a link in every page's footer, and its slug in `e2e/run.mjs`.
- `llms.txt` summarises Tick and its pages for AI assistants.
- Structured data names MetricDeck by the same `@id` metricdeck.app uses
  (`https://metricdeck.app/#organization`), and Tick's page there
  (metricdeck.app/tools/2fa-authenticator) is its `subjectOf`, so both sites read as one app and one
  publisher. The footer also links MetricDeck's other free tools.
- The example tiles use brand logos from Iconify's `logos` set (CC0), bundled into
  `public/brands/` by `node e2e/brands.mjs` so the page makes no outside requests.
- Tick is a free tool by [MetricDeck](https://metricdeck.app). Every link to MetricDeck carries
  `utm_source=tickcodes` and a `utm_content` naming its placement, so visits show up in
  MetricDeck's analytics.
- The MetricDeck mark is inlined in `index.html` (also saved as `public/metricdeck-icon.svg`).
- Production domain: `tick.metricdeck.app`. In Vercel, add the domain under Project →
  Settings → Domains, then create a `CNAME` record for `tick` pointing to the target Vercel
  shows. If the domain ever changes, update the canonical, Open Graph and sitemap URLs.

## Project layout

```text
index.html        landing page (static, SEO)
*-*.html          guides (static, SEO), served without .html
app.html          the app shell, served at /app
src/
  landing/        landing page styles and GSAP scroll animations
  lib/            framework-free core: base32, totp, otpauth, migration (Google Authenticator),
                  importers, crypto (vault), storage (IndexedDB), qr, util
  components/     icons, odometer / ring / rail, sheet, segmented control, toasts
  screens/        Setup, Unlock, Vault, AddSheet, EditSheet, SettingsSheet
  App.tsx         vault lifecycle: setup → locked → unlocked
public/           manifest, service worker, icons
e2e/              end-to-end run and icon renderer
```

## Contributing and security

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md). Please report security problems
privately as described in [SECURITY.md](SECURITY.md), not in public issues.

## License

[MIT](LICENSE) © MetricDeck. Tick is a free tool by [MetricDeck](https://metricdeck.app).
