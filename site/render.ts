// Builds the HTML of every site page from site/pages.ts and site/content.
// Runs at build time (vite.web.config.ts); the browser part is site/main.ts.
import { PAGES, SLUGS, HOME, type Slug } from './pages';
import { LOCALES, DEFAULT_LOCALE } from './content';
import type { SiteCopy } from './content/types';
import { STORE_URL, PRIVACY_URL, REPO_URL, LICENSES_URL, KOFI_URL, PAYPAL_URL } from './config';

export interface SiteOptions {
  /** URL path the site is served from, e.g. '/Convertly/'. */
  base: string;
  /** Absolute site URL ending in '/', for canonical links and the sitemap. */
  siteUrl: string;
  /** Add the Content-Security-Policy meta (build only: the dev server injects inline styles). */
  csp: boolean;
}

export interface SitePage {
  /** Output path relative to the site root, e.g. 'heic-to-png/index.html'. */
  file: string;
  html: string;
  /** Canonical URL, or undefined for pages kept out of the sitemap. */
  canonical?: string;
}

// Everything the page needs comes from this origin. Workers: heic-to starts its
// decoder from a blob: URL, pdf.js and the AVIF encoder from files. connect-src
// covers the wasm and font files the encoders fetch; media-src the blob: URL an
// audio file's duration is read from. style-src: the hash is the one <style>
// html2canvas adds while rendering a Word page (it hides pseudo-elements in its
// copy of the page); a new html2canvas version may change it, which the website
// tests catch as a CSP error. style-src-attr: the converter's markup hides some
// rows with inline style attributes.
const CSP = [
  "default-src 'none'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self' blob:",
  "connect-src 'self'",
  "media-src blob:",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "style-src 'self' 'sha256-UP0QZg7irvSMvOBz9mH2PIIE28+57UiavRfeVea0l3g='",
  "style-src-attr 'unsafe-inline'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const prefix = (l: SiteCopy) => (l === DEFAULT_LOCALE ? '' : `${l.lang}/`);

const EXTERNAL = 'target="_blank" rel="noopener"';

/** The website's privacy page, next to the landing pages. */
const PRIVACY_PAGE = 'privacy';

const LOCK_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5zm-3 8V7a3 3 0 0 1 6 0v3z"/></svg>';
const CHECK_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>';

export function buildSite(opts: SiteOptions): SitePage[] {
  const href = (l: SiteCopy, page: string) => `${opts.base}${prefix(l)}${page}/`;
  const canonical = (l: SiteCopy, page: string) => `${opts.siteUrl}${prefix(l)}${page}/`;
  const links: Record<string, string> = {
    store: STORE_URL,
    'ext-privacy': PRIVACY_URL,
    issues: `${REPO_URL}/issues`,
  };
  const fill = (html: string, l: SiteCopy) =>
    html.replace(/\{([a-z0-9-]+)\}/g, (m, key: string) => links[key] ?? (key in PAGES ? href(l, key) : m));

  function head(l: SiteCopy, title: string, description: string, extra: string): string {
    return `<!doctype html>
<html lang="${l.lang}" data-theme="dark">
<head>
<meta charset="utf-8">
${opts.csp ? `<meta http-equiv="Content-Security-Policy" content="${CSP}">\n` : ''}<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark light">
<meta name="theme-color" content="#1a1a1a">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="icon" type="image/png" href="/public/icons/32.png">
<link rel="apple-touch-icon" href="/public/icons/128.png">
${extra}<script type="module" src="/site/main.ts"></script>
</head>`;
  }

  function header(l: SiteCopy, active?: Slug): string {
    // The current page's link holds the lit pill. Pill and labels carry
    // view-transition names, so going to another tool slides the pill under
    // labels that stay put, and a theme switch keeps the labels on top (site.css).
    const links = SLUGS.map((slug) => {
      const label = `<span class="site-nav__label" style="view-transition-name: nav-${slug}">${esc(l.nav[slug])}</span>`;
      return slug === active
        ? `<a class="site-nav__link" aria-current="page" href="${href(l, slug)}"><span class="site-nav__pill" aria-hidden="true"></span>${label}</a>`
        : `<a class="site-nav__link" href="${href(l, slug)}">${label}</a>`;
    }).join('');
    return `<a class="skip" href="#converter">${esc(l.ui.skip)}</a>
<header class="site-header wrap">
  <a class="site-brand" href="${href(l, HOME)}"><span class="brand__dot"></span>Convertly</a>
  <nav class="site-nav" aria-label="${esc(l.ui.tools)}"><div class="site-nav__track">${links}</div></nav>
  <div class="site-header__tools" data-header-tools>
    <a class="btn btn--primary btn--sm site-header__cta" href="${STORE_URL}" ${EXTERNAL}>${esc(l.ui.headerCta)}</a>
  </div>
</header>`;
  }

  function footer(l: SiteCopy, page: string = HOME): string {
    const tools = SLUGS.map((s) => `<a href="${href(l, s)}">${esc(l.nav[s])}</a>`).join('');
    const langs =
      LOCALES.length > 1
        ? `<nav class="site-footer__langs" aria-label="${esc(l.ui.language)}">${LOCALES.map(
            (o) =>
              `<a href="${href(o, page)}" hreflang="${o.lang}" lang="${o.lang}"${o === l ? ' aria-current="true"' : ''}>${esc(o.name)}</a>`,
          ).join('')}</nav>`
        : '';
    return `<footer class="site-footer wrap">
  <nav class="site-footer__tools" aria-label="${esc(l.ui.tools)}">${tools}</nav>
  <p class="site-footer__links">
    <a href="${href(l, PRIVACY_PAGE)}">${esc(l.ui.privacy)}</a>
    <a href="${REPO_URL}" ${EXTERNAL}>${esc(l.ui.source)}</a>
    <a href="${LICENSES_URL}" ${EXTERNAL}>${esc(l.ui.licenses)}</a>
    <span>${esc(l.ui.support)}: <a href="${KOFI_URL}" ${EXTERNAL}>Ko-fi</a> · <a href="${PAYPAL_URL}" ${EXTERNAL}>PayPal</a></span>
  </p>
  ${langs}
  <p class="site-footer__note">${esc(l.ui.footerNote)}</p>
</footer>`;
  }

  function landing(l: SiteCopy, slug: Slug): string {
    const page = l.pages[slug];
    const url = canonical(l, slug);
    const alternates = LOCALES.map(
      (o) => `<link rel="alternate" hreflang="${o.lang}" href="${canonical(o, slug)}">`,
    ).join('\n');
    // Structured data is a data block, not a script: CSP doesn't apply to it.
    const ld = JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'WebApplication',
          name: `Convertly: ${l.nav[slug]}`,
          url,
          applicationCategory: 'MultimediaApplication',
          operatingSystem: 'Any',
          browserRequirements: 'Requires JavaScript',
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        },
        {
          '@type': 'FAQPage',
          mainEntity: page.faq.map((f) => ({
            '@type': 'Question',
            name: f.q,
            acceptedAnswer: { '@type': 'Answer', text: f.a.replace(/<[^>]+>/g, '') },
          })),
        },
      ],
    }).replace(/</g, '\\u003c');
    const extra = `<link rel="canonical" href="${url}">
${alternates}
<link rel="alternate" hreflang="x-default" href="${canonical(DEFAULT_LOCALE, slug)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Convertly">
<meta property="og:title" content="${esc(page.title)}">
<meta property="og:description" content="${esc(page.description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${opts.siteUrl}og.png">
<meta property="og:image:width" content="1400">
<meta property="og:image:height" content="560">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${ld}</script>
`;
    const facts = l.ui.facts
      .map((f, i) => `<li>${i === 0 ? LOCK_ICON : CHECK_ICON}${esc(f)}</li>`)
      .join('');
    const sections = page.sections
      .map((s) => `<section><h2>${esc(s.h2)}</h2><p>${fill(s.body, l)}</p></section>`)
      .join('\n    ');
    const faq = page.faq
      .map(
        (f) =>
          `<details class="faq__item"><summary>${esc(f.q)}</summary><p>${fill(f.a, l)}</p></details>`,
      )
      .join('\n    ');
    const points = l.ui.ctaPoints.map((p) => `<li>${CHECK_ICON}${esc(p)}</li>`).join('');
    const preset = esc(JSON.stringify(PAGES[slug]));

    return `${head(l, page.title, page.description, extra)}
<body class="site" data-theme="dark">
${header(l, slug)}
<main>
  <section class="hero wrap">
    <h1>${esc(page.h1)}</h1>
    <p class="hero__lead">${esc(page.lead)}</p>
    <ul class="hero__facts">${facts}</ul>
  </section>
  <section class="converter" id="converter" aria-label="${esc(l.ui.converter)}">
    <div id="app" data-preset="${preset}"></div>
    <noscript><p class="converter__noscript">${esc(l.ui.noscript)}</p></noscript>
    <div class="notice notice--rate site-offer" data-done-offer hidden>
      <span class="notice__text">${esc(l.ui.offerText)}</span>
      <a class="btn btn--sm btn--primary" href="${STORE_URL}" ${EXTERNAL}>${esc(l.ui.offerButton)}</a>
    </div>
  </section>
  <section class="wrap" aria-labelledby="cta-title">
    <div class="cta">
      <img class="cta__icon" src="/public/icons/128.png" width="64" height="64" alt="">
      <div class="cta__body">
        <h2 id="cta-title">${esc(l.ui.ctaTitle)}</h2>
        <p>${esc(l.ui.ctaText)}</p>
        <ul class="cta__points">${points}</ul>
      </div>
      <div class="cta__action">
        <a class="btn btn--primary btn--lg" href="${STORE_URL}" ${EXTERNAL}>${esc(l.ui.ctaButton)}</a>
        <p class="cta__note">${esc(l.ui.ctaNote)}</p>
      </div>
    </div>
  </section>
  <article class="article wrap">
    ${sections}
  </article>
  <section class="faq wrap" aria-labelledby="faq-title">
    <h2 id="faq-title">${esc(l.ui.faqTitle)}</h2>
    <div class="faq__list">
    ${faq}
    </div>
  </section>
</main>
${footer(l, slug)}
</body>
</html>
`;
  }

  function privacy(l: SiteCopy): string {
    const p = l.privacy;
    const body = p.body.map((b) => `<p>${fill(b, l)}</p>`).join('\n    ');
    return `${head(l, p.title, p.description, `<link rel="canonical" href="${canonical(l, PRIVACY_PAGE)}">\n`)}
<body class="site" data-theme="dark">
${header(l)}
<main>
  <article class="article article--page wrap" id="converter">
    <h1>${esc(p.h1)}</h1>
    ${body}
  </article>
</main>
${footer(l, PRIVACY_PAGE)}
</body>
</html>
`;
  }

  function notFound(l: SiteCopy): string {
    const tools = SLUGS.map(
      (s) => `<li><a class="btn btn--ghost" href="${href(l, s)}">${esc(l.nav[s])}</a></li>`,
    ).join('');
    return `${head(l, `${l.ui.notFoundTitle} | Convertly`, l.ui.notFoundText, '<meta name="robots" content="noindex">\n')}
<body class="site" data-theme="dark">
${header(l)}
<main>
  <section class="hero wrap" id="converter">
    <h1>${esc(l.ui.notFoundTitle)}</h1>
    <p class="hero__lead">${esc(l.ui.notFoundText)}</p>
    <ul class="notfound__tools">${tools}</ul>
  </section>
</main>
${footer(l)}
</body>
</html>
`;
  }

  const pages: SitePage[] = [];
  for (const l of LOCALES) {
    for (const slug of SLUGS) {
      pages.push({ file: `${prefix(l)}${slug}/index.html`, html: landing(l, slug), canonical: canonical(l, slug) });
    }
    // The language root shows the main page (canonical: its own /heic-to-jpg/).
    pages.push({ file: `${prefix(l)}index.html`, html: landing(l, HOME) });
    pages.push({
      file: `${prefix(l)}${PRIVACY_PAGE}/index.html`,
      html: privacy(l),
      canonical: canonical(l, PRIVACY_PAGE),
    });
  }
  pages.push({ file: '404.html', html: notFound(DEFAULT_LOCALE) });
  return pages;
}
