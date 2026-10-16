// The website (site-dist/): every landing page loads cleanly under its CSP,
// opens the converter with the page's preset, and converts without the network.
import { test as base, expect, type Page } from '@playwright/test';
import { SLUGS, type Slug } from '../../site/pages';
import { en } from '../../site/content/en';
import { STORE_URL, GOOGLE_VERIFICATION } from '../../site/config';
import { addFiles, convert, row, download, sample, MAGIC } from '../e2e/fixtures';
import { png, wav, pdf, docx, jpegSize, pdfPages } from '../e2e/make';

const test = base.extend<{ site: Page }>({
  site: async ({ page, baseURL }, use) => {
    const errors: string[] = [];
    const offsite: string[] = [];
    const origin = new URL(baseURL!).origin;
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('request', (r) => {
      const url = r.url();
      if (!url.startsWith(origin) && !url.startsWith('blob:') && !url.startsWith('data:')) offsite.push(url);
    });
    await use(page);
    // No uncaught errors, no CSP violations, and nothing fetched from anywhere else.
    expect(errors).toEqual([]);
    expect(offsite).toEqual([]);
  },
});

async function open(page: Page, slug: Slug | ''): Promise<void> {
  await page.goto(slug ? `${slug}/` : '');
  await page.locator('#app .dropzone').waitFor();
}

for (const slug of SLUGS) {
  test(`${slug}: title, heading, text and the converter`, async ({ site }) => {
    const copy = en.pages[slug];
    await open(site, slug);
    await expect(site).toHaveTitle(copy.title);
    await expect(site.locator('meta[name="description"]')).toHaveAttribute('content', copy.description);
    await expect(site.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://antalikra.github.io/Convertly/${slug}/`);
    await expect(site.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute('content', /default-src 'none'/);
    await expect(site.locator('h1')).toHaveText(copy.h1);
    await expect(site.locator('.article section')).toHaveCount(copy.sections.length);
    await expect(site.locator('.faq__item')).toHaveCount(copy.faq.length);
    await expect(site.locator('.site-nav [aria-current="page"]')).toHaveText(en.nav[slug]);
    // The converter's own header bits moved into the page header.
    await expect(site.locator('#app .topbar')).toHaveCount(0);
    await expect(site.locator('.site-header [data-theme-btn]')).toBeVisible();
    await expect(site.locator('.cta a.btn')).toHaveAttribute('href', STORE_URL);
  });
}

test('the site root is the HEIC to JPG page', async ({ site }) => {
  await open(site, '');
  await expect(site.locator('h1')).toHaveText(en.pages['heic-to-jpg'].h1);
  await expect(site.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://antalikra.github.io/Convertly/heic-to-jpg/');
});

test('HEIC to JPG: an iPhone photo becomes a full-size JPG, then the extension is offered', async ({ site }) => {
  await open(site, 'heic-to-jpg');
  const offer = site.locator('[data-done-offer]');
  await expect(offer).toBeHidden();
  await addFiles(site, [sample('photo.heic')]);
  await expect(site.locator('[data-seg="image"] .seg__btn--active')).toHaveText('JPG');
  await convert(site);
  const r = row(site, 'photo.heic');
  await expect(r.locator('.badge')).toHaveText('Done');
  const out = await download(site, r.locator('button[title="Download"]'));
  expect(out.name).toBe('photo.jpg');
  expect(MAGIC.jpg(out.bytes)).toBe(true);
  expect(jpegSize(out.bytes)).toEqual({ width: 1024, height: 768 });
  await expect(offer).toBeVisible();
  await expect(offer.locator('a')).toHaveAttribute('href', STORE_URL);
});

test('HEIC to PNG and HEIC to PDF pages start on their format', async ({ site }) => {
  await open(site, 'heic-to-png');
  await addFiles(site, [sample('photo.heic')]);
  await expect(site.locator('[data-seg="image"] .seg__btn--active')).toHaveText('PNG');
  await convert(site);
  const png = await download(site, row(site, 'photo.heic').locator('button[title="Download"]'));
  expect(png.name).toBe('photo.png');
  expect(MAGIC.png(png.bytes)).toBe(true);

  await open(site, 'heic-to-pdf');
  await addFiles(site, [sample('photo.heic')]);
  await expect(site.locator('[data-seg="image"] .seg__btn--active')).toHaveText('PDF');
  await convert(site);
  const doc = await download(site, site.locator('[data-slot="result"] button[title="Download"]'));
  expect(MAGIC.pdf(doc.bytes)).toBe(true);
  expect(await pdfPages(doc.bytes)).toBe(1);
});

test('AVIF encodes on a page without cross-origin isolation (single-threaded encoder)', async ({ site }) => {
  await open(site, 'webp-to-jpg');
  expect(await site.evaluate(() => crossOriginIsolated)).toBe(false);
  await addFiles(site, [png('chart.png')]);
  await expect(site.locator('[data-seg="image"] .seg__btn--active')).toHaveText('JPG');
  await site.locator('[data-seg="image"] [data-fmt="avif"]').click();
  await convert(site);
  const out = await download(site, row(site, 'chart.png').locator('button[title="Download"]'));
  expect(out.name).toBe('chart.avif');
  expect(MAGIC.avif(out.bytes)).toBe(true);
});

test('Merge PDF opens on Documents with Merge selected', async ({ site }) => {
  await open(site, 'merge-pdf');
  await expect(site.locator('[data-tab="pdf"]')).toHaveAttribute('aria-selected', 'true');
  await addFiles(site, [await pdf('report.pdf', 3), await pdf('invoice.pdf', 2)]);
  await expect(site.locator('[data-pdfop-seg] .seg__btn--active')).toHaveAttribute('data-op', 'merge');
  await convert(site);
  const merged = await download(site, site.locator('[data-slot="result"] button[title="Download"]'));
  expect(merged.name).toBe('report-merged.pdf');
  expect(await pdfPages(merged.bytes)).toBe(5);
});

test('the other document tools work under the CSP too (pdf.js worker, Word rendering, fonts)', async ({ site }) => {
  await open(site, 'merge-pdf');
  await addFiles(site, [await pdf('report.pdf', 2), docx('notes.docx')]);
  await site.locator('[data-pdfop-seg] [data-op="tojpg"]').click();
  await convert(site);
  const pages = await download(site, row(site, 'report.pdf').locator('button[title="Download ZIP"]'));
  expect(MAGIC.zip(pages.bytes)).toBe(true);
  const visual = await download(site, row(site, 'notes.docx').locator('button[title="Download"]'));
  expect(visual.name).toBe('notes.pdf');
  expect(MAGIC.pdf(visual.bytes)).toBe(true);
  // Text mode embeds the bundled Roboto font, fetched from this origin.
  await site.locator('[data-docx="reflow"]').click();
  await convert(site);
  const text = await download(site, row(site, 'notes.docx').locator('button[title="Download"]'));
  expect(MAGIC.pdf(text.bytes)).toBe(true);
});

test('WAV to MP3 starts on MP3', async ({ site }) => {
  await open(site, 'wav-to-mp3');
  await addFiles(site, [wav('memo.wav')]);
  await expect(site.locator('[data-seg="audio"] .seg__btn--active')).toHaveText('MP3');
  await convert(site);
  const out = await download(site, row(site, 'memo.wav').locator('button[title="Download"]'));
  expect(out.name).toBe('memo.mp3');
  expect(MAGIC.mp3(out.bytes)).toBe(true);
});

test('settings persist across pages in localStorage', async ({ site }) => {
  await open(site, 'heic-to-jpg');
  await expect(site.locator('body')).toHaveAttribute('data-theme', 'dark');
  await site.locator('.site-header [data-theme-btn]').click();
  await expect(site.locator('body')).toHaveAttribute('data-theme', 'light');
  await open(site, 'merge-pdf');
  await expect(site.locator('body')).toHaveAttribute('data-theme', 'light');
});

test('every page links to the website’s own privacy page', async ({ site }) => {
  await open(site, 'wav-to-mp3');
  await site.locator('.site-footer a', { hasText: en.ui.privacy }).click();
  await expect(site).toHaveURL(/\/Convertly\/privacy\/$/);
  await expect(site.locator('h1')).toHaveText(en.privacy.h1);
  await expect(site.locator('.article--page p')).toHaveCount(en.privacy.body.length);
});

test('serves the Search Console ownership file byte for byte', async ({ request }) => {
  const res = await request.get(`${GOOGLE_VERIFICATION}.html`);
  expect(res.status()).toBe(200);
  expect(await res.text()).toBe(`google-site-verification: ${GOOGLE_VERIFICATION}.html`);
});

test('the 404 page links to every converter and stays out of search', async ({ site }) => {
  // GitHub Pages serves 404.html for unknown addresses; vite preview doesn't, so open it directly.
  await site.goto('404.html');
  await expect(site.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  await expect(site.locator('.notfound__tools a')).toHaveCount(SLUGS.length);
});
