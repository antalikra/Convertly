// Loads the built extension (dist/) into a fresh Chromium profile and opens its window page.
import { test as base, chromium, expect, type BrowserContext, type Page, type Download } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));

export const DIST = join(HERE, '..', '..', 'dist');
export const SAMPLES = join(HERE, 'samples');

type Fixtures = { lang: string; context: BrowserContext; extensionId: string; app: Page };

export const test = base.extend<Fixtures>({
  lang: ['en', { option: true }],
  context: async ({ lang }, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      acceptDownloads: true,
      locale: lang,
      viewport: { width: 880, height: 740 },
      args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`, `--lang=${lang}`],
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    await use(new URL(sw.url()).host);
  },
  app: async ({ context, extensionId }, use) => {
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.goto(`chrome-extension://${extensionId}/app.html`);
    await page.locator('.dropzone').waitFor();
    await use(page);
    // No uncaught errors and no CSP violations during the whole test.
    expect(errors).toEqual([]);
  },
});
export { expect };

/** Adds files through the dropzone's file picker. */
export async function addFiles(app: Page, files: Array<string | { name: string; mimeType: string; buffer: Buffer }>): Promise<void> {
  await app.setInputFiles('.dropzone input', files as never);
}

/** Clicks Convert and waits until no file is in progress. */
export async function convert(app: Page): Promise<void> {
  await app.locator('[data-convert]').click();
  await expect(app.locator('body')).not.toHaveClass(/is-busy/, { timeout: 120_000 });
  await expect(app.locator('.fileitem .spinner')).toHaveCount(0);
}

/** The row of a file by its name. */
export const row = (app: Page, name: string) => app.locator('.fileitem').filter({ has: app.locator('.fileitem__name', { hasText: name }) });

/** Clicks a download button and returns the file name and bytes. */
export async function download(app: Page, button: ReturnType<Page['locator']>): Promise<{ name: string; bytes: Buffer }> {
  const [d]: [Download, void] = await Promise.all([app.waitForEvent('download'), button.click()]);
  return { name: d.suggestedFilename(), bytes: readFileSync((await d.path())!) };
}

export const sample = (name: string) => join(SAMPLES, name);

/** File signatures of the formats Convertly writes. */
export const MAGIC: Record<string, (b: Buffer) => boolean> = {
  jpg: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  png: (b) => b.toString('hex', 0, 8) === '89504e470d0a1a0a',
  webp: (b) => b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP',
  avif: (b) => b.toString('latin1', 4, 12) === 'ftypavif',
  tiff: (b) => ['II*\0', 'MM\0*'].includes(b.toString('latin1', 0, 4)),
  bmp: (b) => b.toString('latin1', 0, 2) === 'BM',
  wav: (b) => b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WAVE',
  mp3: (b) => b.toString('latin1', 0, 3) === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0),
  ogg: (b) => b.toString('latin1', 0, 4) === 'OggS',
  pdf: (b) => b.toString('latin1', 0, 5) === '%PDF-',
  zip: (b) => b.toString('latin1', 0, 4) === 'PK\x03\x04',
};
