import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { LOCALES, pickLocale, initI18n, t, tn } from '../src/i18n';
import { pngColors } from '../src/infra/encode';
import { DEFAULT_SETTINGS } from '../src/infra/settings';

const DIR = join(__dirname, '..', 'src', 'i18n');
const load = (l: string): Record<string, string> => JSON.parse(readFileSync(join(DIR, `${l}.json`), 'utf8'));
const en = load('en');
const placeholders = (s: string) => [...s.matchAll(/\$\d/g)].map((m) => m[0]).sort().join(',');
const pluralBases = [...new Set(Object.keys(en).filter((k) => k.includes('.')).map((k) => k.split('.')[0]))];

describe('translations', () => {
  it('ship a file for every supported locale and nothing else', () => {
    const files = readdirSync(DIR).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));
    expect(files.sort()).toEqual([...LOCALES].sort());
  });

  for (const locale of LOCALES) {
    it(`${locale}: every string, same placeholders, plural forms for real counts`, () => {
      const m = load(locale);
      const rules = new Intl.PluralRules(locale.replace('_', '-'));
      for (const [key, value] of Object.entries(en)) {
        if (key.includes('.')) continue;
        expect(m[key], `${locale}.${key}`).toBeTypeOf('string');
        expect(m[key].trim(), `${locale}.${key}`).not.toBe('');
        expect(placeholders(m[key]), `${locale}.${key}`).toBe(placeholders(value));
      }
      for (const base of pluralBases) {
        expect(m[`${base}.other`], `${locale}.${base}.other`).toBeTypeOf('string');
        for (let n = 0; n <= 1000; n++) {
          const cat = rules.select(n);
          expect(m[`${base}.${cat}`], `${locale}.${base}.${cat} (n=${n})`).toBeTypeOf('string');
        }
      }
      for (const key of Object.keys(m)) {
        const base = key.split('.')[0];
        expect(key in en || pluralBases.includes(base), `${locale}: unknown key ${key}`).toBe(true);
      }
      // Chrome Web Store limits: name 75, short description 132 characters.
      expect(m.extName.length, `${locale} extName`).toBeLessThanOrEqual(75);
      expect(m.extDescription.length, `${locale} extDescription`).toBeLessThanOrEqual(132);
      expect(m.extName).toContain('Convertly');
    });
  }

  it('public/_locales matches src/i18n (run scripts/locales.mjs after editing strings)', () => {
    expect(() => execFileSync(process.execPath, ['scripts/locales.mjs', '--check'], { cwd: join(__dirname, '..') })).not.toThrow();
  });
});

describe('i18n runtime', () => {
  it('maps browser languages to the closest supported locale', () => {
    expect(pickLocale('en-US')).toBe('en');
    expect(pickLocale('de-AT')).toBe('de');
    expect(pickLocale('pt-BR')).toBe('pt_BR');
    expect(pickLocale('pt-PT')).toBe('pt_BR');
    expect(pickLocale('zh-TW')).toBe('zh_CN');
    expect(pickLocale('uk')).toBe('uk');
    expect(pickLocale('sv-SE')).toBe('en');
  });

  it('fills placeholders and picks plural forms', async () => {
    await initI18n('ru');
    expect(tn('nFiles', 1)).toBe('1 файл');
    expect(tn('nFiles', 3)).toBe('3 файла');
    expect(tn('nFiles', 11)).toBe('11 файлов');
    expect(t('converting', 2, 5)).toBe('Конвертация… 2/5');
    await initI18n('en');
    expect(tn('nFiles', 1)).toBe('1 file');
    expect(tn('nFiles', 2)).toBe('2 files');
    expect(t('limitNotice', 200, 3)).toBe('Up to 200 files at a time — 3 not added.');
  });
});

describe('default quality', () => {
  it('is 90%: JPG near the HEIC size, PNG still lossless', () => {
    expect(DEFAULT_SETTINGS.quality).toBe(0.9);
    expect(pngColors(DEFAULT_SETTINGS.quality)).toBe(0);
    expect(pngColors(1)).toBe(0);
    expect(pngColors(0.5)).toBe(128);
    expect(pngColors(0.004)).toBe(2);
  });
});
