/// <reference types="vitest/config" />
import { resolve } from 'node:path';
import { defineConfig, type Connect, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Strict CSP for production builds only: the dev server injects inline scripts for HMR.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "media-src 'self' blob:",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

function csp(): Plugin {
  return {
    name: 'tick-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
      );
    },
  };
}

// Pages served at clean paths (/app → app.html). Vercel rewrites them in production
// (vercel.json); this does the same for the dev and preview servers.
const PAGES = ['app', 'google-authenticator-on-pc', 'authy-desktop-alternative'];

function cleanRoutes(): Plugin {
  const rewrite: Connect.NextHandleFunction = (req, _res, next) => {
    const [path, query] = (req.url ?? '').split(/\?(.*)/s);
    const name = path.replace(/^\/|\/$/g, '');
    if (PAGES.includes(name)) req.url = `/${name}.html${query ? `?${query}` : ''}`;
    next();
  };
  return {
    name: 'tick-clean-routes',
    configureServer(server) {
      server.middlewares.use(rewrite);
    },
    configurePreviewServer(server) {
      server.middlewares.use(rewrite);
    },
  };
}

export default defineConfig({
  plugins: [react(), csp(), cleanRoutes()],
  appType: 'mpa',
  build: {
    target: 'es2022',
    sourcemap: false,
    // Never inline assets as data: URLs; the CSP only allows files from this origin.
    assetsInlineLimit: 0,
    rollupOptions: {
      input: {
        landing: resolve(__dirname, 'index.html'),
        ...Object.fromEntries(PAGES.map((name) => [name, resolve(__dirname, `${name}.html`)])),
      },
    },
  },
  test: { environment: 'node' },
});
