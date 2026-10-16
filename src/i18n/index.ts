// UI strings. English ships in the main bundle; the browser's language, when we
// have it, is loaded once on start (the store listing follows the same language).
// Messages use $1…$9 placeholders. Plural forms are keyed `<base>.<category>`
// with the Intl.PluralRules categories (one, few, many, other).
import en from './en.json';

type Messages = Record<string, string>;

export const LOCALES = [
  'en', 'de', 'es', 'fr', 'it', 'nl', 'pl', 'pt_BR', 'tr', 'uk', 'ru', 'ja', 'ko', 'zh_CN',
] as const;
export type Locale = (typeof LOCALES)[number];

const loaders = import.meta.glob<Messages>(['./*.json', '!./en.json'], { import: 'default' });

let messages: Messages = en;
let current: Locale = 'en';
let plural = new Intl.PluralRules('en');

/** Best supported match for a BCP 47 tag: "pt-BR" → pt_BR, "de-AT" → de, "zh-TW" → zh_CN. */
export function pickLocale(tag: string): Locale {
  const norm = tag.replace('-', '_').toLowerCase();
  const exact = LOCALES.find((l) => l.toLowerCase() === norm);
  if (exact) return exact;
  const lang = norm.split('_')[0];
  if (lang === 'pt') return 'pt_BR';
  if (lang === 'zh') return 'zh_CN';
  return LOCALES.find((l) => l === lang) ?? 'en';
}

function uiLanguage(): string {
  // Outside an extension page (tests, a plain web page) there is no chrome.i18n.
  const ext = globalThis.chrome?.i18n as typeof chrome.i18n | undefined;
  return ext ? ext.getUILanguage() : (globalThis.navigator?.language ?? 'en');
}

/** Loads the messages for `tag` (default: the browser's UI language). */
export async function initI18n(tag: string = uiLanguage()): Promise<Locale> {
  current = pickLocale(tag);
  messages = current === 'en' ? en : { ...en, ...(await loaders[`./${current}.json`]()) };
  plural = new Intl.PluralRules(current.replace('_', '-'));
  if (globalThis.document) document.documentElement.lang = current.replace('_', '-');
  return current;
}

export function locale(): Locale {
  return current;
}

/** Message for `key` with $1…$9 replaced by `subs`. */
export function t(key: string, ...subs: Array<string | number>): string {
  const msg = messages[key] ?? (en as Messages)[key] ?? key;
  return msg.replace(/\$(\d)/g, (m, d: string) => {
    const v = subs[Number(d) - 1];
    return v === undefined ? m : String(v);
  });
}

/** Plural-aware message: `<base>.<category for n>`, falling back to `<base>.other`. $1 = n. */
export function tn(base: string, n: number, ...subs: Array<string | number>): string {
  const key = `${base}.${plural.select(n)}`;
  return t(messages[key] !== undefined ? key : `${base}.other`, n, ...subs);
}
