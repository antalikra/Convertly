import { defineConfig, normalizePath, type Plugin } from 'vite';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { buildSite, type SitePage } from './site/render';
import { SITE_URL, EXTENSION_ID, GOOGLE_VERIFICATION } from './site/config';

// The website: the extension's converter in a plain web page plus one landing
// page per task, built as a static site for GitHub Pages (`npm run build:web`
// → site-dist/). Pages are generated from site/pages.ts + site/content and fed
// to Vite as virtual HTML entries, so there is no HTML to keep in sync by hand.

const base = new URL(SITE_URL).pathname;
const idOf = (file: string) => normalizePath(resolve(__dirname, file));

function sitePages(pages: SitePage[]): Plugin {
  const byId = new Map(pages.map((p) => [idOf(p.file), p]));
  return {
    name: 'convertly-site-pages',
    enforce: 'pre',
    config: () => ({ build: { rollupOptions: { input: [...byId.keys()] } } }),
    resolveId: (id) => (byId.has(id) ? id : undefined),
    load: (id) => byId.get(id)?.html,
    // The entry script blocks the first frame (it's small and same-origin), so
    // the converter is already mounted when the page shows: nothing jumps in,
    // and the slide from another page captures it too.
    transformIndexHtml: {
      order: 'post',
      handler: (html) =>
        html.replace('<script type="module" crossorigin', '<script type="module" blocking="render" crossorigin'),
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '').split('?')[0];
        if (!path.startsWith(base)) return next();
        const rel = path.slice(base.length);
        const page = byId.get(idOf(rel === '' || rel.endsWith('/') ? `${rel}index.html` : rel));
        if (!page) return next();
        server
          .transformIndexHtml(req.url ?? path, page.html)
          .then((html) => {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end(html);
          })
          .catch(next);
      });
    },
    generateBundle() {
      const urls = pages.flatMap((p) => (p.canonical ? [`  <url><loc>${p.canonical}</loc></url>`] : []));
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`,
      });
      // Crawlers read robots.txt only at the host root, so this one counts once
      // the site has its own domain; until then submit the sitemap by hand.
      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source: `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}sitemap.xml\n`,
      });
      // Search Console ownership check: exact content, no trailing newline.
      this.emitFile({
        type: 'asset',
        fileName: `${GOOGLE_VERIFICATION}.html`,
        source: `google-site-verification: ${GOOGLE_VERIFICATION}.html`,
      });
      // Social preview image: needs a fixed, unhashed URL.
      this.emitFile({
        type: 'asset',
        fileName: 'og.png',
        source: readFileSync(resolve(__dirname, 'store/marquee-1400x560.png')),
      });
    },
  };
}

export default defineConfig(({ command }) => {
  if (!EXTENSION_ID) {
    const msg = 'site/config.ts: EXTENSION_ID is empty, so the Chrome Web Store links are placeholders.';
    if (command === 'build' && process.env.CI) throw new Error(msg);
    console.warn(`\n(!) ${msg}\n`);
  }
  return {
    base,
    appType: 'mpa',
    // Assets are referenced by their repo path (/public/icons/…) and hashed;
    // the extension's public/ (with _locales) is not copied.
    publicDir: false,
    resolve: {
      alias: {
        '@core': resolve(__dirname, 'src/core'),
        '@app': resolve(__dirname, 'src/app'),
        '@infra': resolve(__dirname, 'src/infra'),
        '@ui': resolve(__dirname, 'src/ui'),
        '@shared': resolve(__dirname, 'src/shared'),
      },
    },
    // Same reason as the extension build (vite.config.ts): @jsquash/avif's
    // multi-threaded worker needs ES workers to build. GitHub Pages can't send
    // COOP/COEP headers, so the page isn't cross-origin-isolated and the
    // encoder takes its single-threaded path at runtime.
    worker: { format: 'es' },
    optimizeDeps: { entries: ['site/main.ts'] },
    build: {
      target: 'es2022',
      outDir: 'site-dist',
      emptyOutDir: true,
    },
    plugins: [sitePages(buildSite({ base, siteUrl: SITE_URL, csp: command === 'build' }))],
  };
});
