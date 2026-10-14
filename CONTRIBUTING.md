# Contributing to Tick

Thanks for helping. Tick is small on purpose, so the bar for new features is "does this make getting
a code faster or safer?"

## Before you start

- **Bugs:** open an issue with steps to reproduce, your browser and OS.
- **Features:** open an issue first so we can agree on the approach before you write code.
- **Security problems:** don't open an issue; see [SECURITY.md](SECURITY.md).

## Development

```bash
npm install
npm run dev        # http://localhost:5173 (landing) and /app
npm test           # unit tests
npm run build      # type-check and build
npm run e2e        # end-to-end checks against the build (run `npx playwright install chromium` once)
```

## Pull requests

- Keep each pull request to one change, and add or update tests for it.
- `npm run build`, `npm test` and `npm run e2e` must pass; CI runs all three.
- Don't add network requests, analytics or third-party scripts. The app must keep working with
  the strict Content Security Policy in `vite.config.ts`.
- New dependencies need a good reason; the vault code in `src/lib/` should stay dependency-free.
- UI changes follow the design notes in the README and support light, dark and reduced motion.

By contributing you agree that your work is released under the [MIT License](LICENSE).
