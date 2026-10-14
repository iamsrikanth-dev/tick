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

// The app lives at /app (app.html); the landing page is index.html. Vercel rewrites /app in
// production (vercel.json); this does the same for the dev and preview servers.
function appRoute(): Plugin {
  const rewrite: Connect.NextHandleFunction = (req, _res, next) => {
    if (req.url === '/app' || req.url?.startsWith('/app?') || req.url === '/app/') {
      req.url = '/app.html' + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '');
    }
    next();
  };
  return {
    name: 'tick-app-route',
    configureServer(server) {
      server.middlewares.use(rewrite);
    },
    configurePreviewServer(server) {
      server.middlewares.use(rewrite);
    },
  };
}

export default defineConfig({
  plugins: [react(), csp(), appRoute()],
  appType: 'mpa',
  build: {
    target: 'es2022',
    sourcemap: false,
    rollupOptions: {
      input: {
        landing: resolve(__dirname, 'index.html'),
        app: resolve(__dirname, 'app.html'),
      },
    },
  },
  test: { environment: 'node' },
});
