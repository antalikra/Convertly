// Writes public/_locales/<locale>/messages.json (the extension name, description and
// toolbar title the browser and the Chrome Web Store show) from src/i18n/<locale>.json,
// so every string has one source. Runs before each build; `--check` only verifies.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src', 'i18n');
const OUT = join(ROOT, 'public', '_locales');
export const MANIFEST_KEYS = ['extName', 'extDescription', 'actionTitle'];

export function localeFiles() {
  return readdirSync(SRC)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -5))
    .sort();
}

export function messagesFor(locale) {
  const src = JSON.parse(readFileSync(join(SRC, `${locale}.json`), 'utf8'));
  const out = {};
  for (const key of MANIFEST_KEYS) out[key] = { message: src[key] };
  return `${JSON.stringify(out, null, 2)}\n`;
}

const check = process.argv.includes('--check');
let stale = 0;
for (const locale of localeFiles()) {
  const file = join(OUT, locale, 'messages.json');
  const want = messagesFor(locale);
  if (check) {
    if (!existsSync(file) || readFileSync(file, 'utf8') !== want) {
      console.error(`stale: ${file}`);
      stale++;
    }
    continue;
  }
  mkdirSync(join(OUT, locale), { recursive: true });
  writeFileSync(file, want);
}
if (stale) process.exit(1);
