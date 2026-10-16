import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, addFiles, convert, row, download, sample, MAGIC, DIST } from './fixtures';
import { png, wav, pdf, docx, jpegSize, pdfPages } from './make';

test('an iPhone HEIC photo becomes a full-size JPG at 90% quality', async ({ app }) => {
  // The empty window is one big drop target that says nothing is uploaded.
  await expect(app.locator('.dropzone__title')).toHaveText('Drop HEIC photos, images or audio');
  await expect(app.locator('.dropzone__privacy')).toContainText('nothing is uploaded');

  await addFiles(app, [sample('photo.heic')]);
  // With files in the tab the drop area shrinks to a bar.
  await expect(app.locator('.dropzone')).toHaveClass(/dropzone--compact/);
  await expect(app.locator('.dropzone__title')).toHaveText('Add more files');
  await expect(app.locator('[data-seg="image"] .seg__btn--active')).toHaveText('JPG');
  await expect(app.locator('[data-quality-val]')).toHaveText('90%');

  await convert(app);
  const r = row(app, 'photo.heic');
  await expect(r.locator('.badge')).toHaveText('Done');
  const out = await download(app, r.locator('button[title="Download"]'));
  expect(out.name).toBe('photo.jpg');
  expect(MAGIC.jpg(out.bytes)).toBe(true);
  expect(jpegSize(out.bytes)).toEqual({ width: 1024, height: 768 });
  await expect(app.locator('[data-summary]')).toContainText('1 file · 1 done');
});

test('images convert to every output format', async ({ app }) => {
  await addFiles(app, [png('chart.png')]);
  const formats: Array<[string, keyof typeof MAGIC, string]> = [
    ['png', 'png', 'chart.png'],
    ['webp', 'webp', 'chart.webp'],
    ['avif', 'avif', 'chart.avif'],
    ['tiff', 'tiff', 'chart.tiff'],
    ['bmp', 'bmp', 'chart.bmp'],
    ['jpeg', 'jpg', 'chart.jpg'],
  ];
  for (const [fmt, magic, name] of formats) {
    await app.locator(`[data-seg="image"] [data-fmt="${fmt}"]`).click();
    await convert(app);
    const r = row(app, 'chart.png');
    await expect(r.locator('.badge')).toHaveText('Done');
    const out = await download(app, r.locator('button[title="Download"]'));
    expect(out.name, fmt).toBe(name);
    expect(MAGIC[magic](out.bytes), fmt).toBe(true);
  }
  // Several images into one PDF.
  await addFiles(app, [png('second.png', 200, 320)]);
  await app.locator('[data-seg="image"] [data-fmt="pdf"]').click();
  await convert(app);
  const out = await download(app, app.locator('[data-slot="result"] button[title="Download"]'));
  expect(MAGIC.pdf(out.bytes)).toBe(true);
  expect(await pdfPages(out.bytes)).toBe(2);
});

test('audio converts to MP3, OGG and WAV', async ({ app }) => {
  await addFiles(app, [wav('memo.wav')]);
  await expect(row(app, 'memo.wav').locator('.fileitem__meta')).toContainText('0:03');
  for (const [fmt, name] of [['mp3', 'memo.mp3'], ['ogg', 'memo.ogg'], ['wav', 'memo.wav']] as const) {
    await app.locator(`[data-seg="audio"] [data-fmt="${fmt}"]`).click();
    if (await app.locator('[data-convert]').isDisabled()) continue; // already in this format
    await convert(app);
    const r = row(app, 'memo.wav');
    await expect(r.locator('.badge')).toHaveText('Done');
    const out = await download(app, r.locator('button[title="Download"]'));
    expect(out.name).toBe(name);
    expect(MAGIC[fmt](out.bytes), fmt).toBe(true);
  }
});

test('PDF tools and Word documents', async ({ app }) => {
  await app.locator('[data-tab="pdf"]').click();
  await expect(app.locator('.dropzone__title')).toHaveText('Drop PDF or Word (DOCX) files');
  await addFiles(app, [await pdf('report.pdf', 3), await pdf('invoice.pdf', 2), docx('notes.docx')]);

  await app.locator('[data-pdfop-seg] [data-op="merge"]').click();
  await convert(app);
  const merged = await download(app, app.locator('[data-slot="result"] button[title="Download"]'));
  expect(await pdfPages(merged.bytes)).toBe(5);
  const notes = await download(app, row(app, 'notes.docx').locator('button[title="Download"]'));
  expect(notes.name).toBe('notes.pdf');
  expect(MAGIC.pdf(notes.bytes)).toBe(true);

  await app.locator('[data-pdfop-seg] [data-op="split"]').click();
  await convert(app);
  await expect(row(app, 'report.pdf').locator('.fileitem__meta')).toContainText('3 files');
  const pages = await download(app, row(app, 'report.pdf').locator('button[title="Download ZIP"]'));
  expect(MAGIC.zip(pages.bytes)).toBe(true);

  await app.locator('[data-docxop="totext"]').click();
  await convert(app);
  const text = await download(app, row(app, 'notes.docx').locator('button[title="Download"]'));
  expect(text.name).toBe('notes.txt');
  expect(text.bytes.toString('utf8')).toContain('Привет');
});

test('a file nothing can convert says so instead of waiting forever', async ({ app }) => {
  await addFiles(app, [{ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') }]);
  const badge = row(app, 'notes.txt').locator('.badge');
  await expect(badge).toHaveText('Not supported');
  await expect(badge).toHaveAttribute('title', 'This file type is not supported.');
});

test('asks for a rating once, after three batches that worked', async ({ app }) => {
  await addFiles(app, [png('a.png', 64, 64)]);
  const ask = app.locator('[data-rate]');
  for (const fmt of ['jpeg', 'webp']) {
    await app.locator(`[data-seg="image"] [data-fmt="${fmt}"]`).click();
    await convert(app);
    await expect(ask).toBeHidden();
  }
  await app.locator('[data-seg="image"] [data-fmt="png"]').click();
  await convert(app);
  await expect(ask).toBeVisible();
  await expect(ask.locator('[data-rate-go]')).toHaveAttribute('href', /^https:\/\/chromewebstore\.google\.com\/detail\/[a-p]{32}\/reviews$/);
  await ask.locator('[data-rate-close]').click();
  await expect(ask).toBeHidden();
  await app.reload();
  await addFiles(app, [png('b.png', 64, 64)]);
  await convert(app);
  await expect(ask).toBeHidden();
});

test('websites cannot open or detect the converter page', async ({ context, extensionId }) => {
  const manifest = JSON.parse(readFileSync(join(DIST, 'manifest.json'), 'utf8'));
  expect(manifest.web_accessible_resources).toBeUndefined();
  expect(manifest.permissions).toEqual(['storage']);
  expect(manifest.host_permissions).toBeUndefined();
  const page = await context.newPage();
  await page.goto('data:text/html,<title>site</title>');
  const reachable = await page.evaluate(
    (url) => fetch(url).then(() => true, () => false),
    `chrome-extension://${extensionId}/app.html`,
  );
  expect(reachable).toBe(false);
});

test('the Convert button stays on screen however long the list is', async ({ app }) => {
  await addFiles(app, Array.from({ length: 12 }, (_, i) => png(`photo-${i + 1}.png`, 64, 64)));
  await expect(app.locator('.fileitem')).toHaveCount(12);
  // The list scrolls inside the window; the page itself never does.
  const layout = await app.evaluate(() => ({
    page: document.scrollingElement!.scrollHeight - innerHeight,
    convert: document.querySelector('[data-convert]')!.getBoundingClientRect().bottom - innerHeight,
  }));
  expect(layout.page).toBeLessThanOrEqual(0);
  expect(layout.convert).toBeLessThanOrEqual(0);
  await expect(app.locator('[data-convert]')).toBeInViewport();
});
