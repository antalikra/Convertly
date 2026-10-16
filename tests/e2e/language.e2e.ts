import { test, expect, addFiles } from './fixtures';
import { png } from './make';

test.describe('German browser', () => {
  test.use({ lang: 'de' });
  test('the window speaks the browser language', async ({ app }) => {
    await expect(app.locator('html')).toHaveAttribute('lang', 'de');
    await expect(app.locator('.dropzone__title')).toHaveText('HEIC-Fotos, Bilder oder Audio hier ablegen');
    await expect(app.locator('[data-tab="pdf"]')).toHaveText('Dokumente');
    await addFiles(app, [png('a.png', 64, 64), png('b.png', 64, 64)]);
    await expect(app.locator('[data-summary]')).toHaveText('2 Dateien');
    await expect(app.locator('[data-convert]')).toHaveText('Umwandeln');
    await expect(app.locator('.group__label').first()).toHaveText('Bildformat');
  });
});

test.describe('Russian browser', () => {
  test.use({ lang: 'ru' });
  test('plural forms follow the language rules', async ({ app }) => {
    await addFiles(app, [png('a.png', 64, 64), png('b.png', 64, 64), png('c.png', 64, 64)]);
    await expect(app.locator('[data-summary]')).toHaveText('3 файла');
    await addFiles(app, [png('d.png', 64, 64), png('e.png', 64, 64)]);
    await expect(app.locator('[data-summary]')).toHaveText('5 файлов');
  });
});

test.describe('unsupported language', () => {
  test.use({ lang: 'sv' });
  test('falls back to English', async ({ app }) => {
    await expect(app.locator('html')).toHaveAttribute('lang', 'en');
    await expect(app.locator('[data-convert]')).toHaveText('Convert');
  });
});
