// Package the built extension (dist/) into release/convertly-<version>.zip
import { readFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { zipSync } from 'fflate';
import { writeFileSync } from 'node:fs';

const root = process.cwd();
const dist = join(root, 'dist');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

// NOTE: do NOT strip avif_enc_mt.* — a real MV3 extension window IS
// cross-origin-isolated, so wasm-feature-detect's threads() returns true and
// @jsquash/avif uses the multi-threaded encoder. Verified 2026-05-30 in Chrome:
// avif_enc_mt-*.wasm loads (200) during a real AVIF convert. Removing it breaks
// AVIF output. (See docs/ARCHITECTURE.md Open Risk #3.)

function walk(dir, files = {}) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, files);
    else files[relative(dist, full).split('\\').join('/')] = new Uint8Array(readFileSync(full));
  }
  return files;
}

try {
  statSync(dist);
} catch {
  console.error('dist/ not found — run `npm run build` first.');
  process.exit(1);
}

const files = walk(dist);
const zipped = zipSync(files, { level: 6 });
mkdirSync(join(root, 'release'), { recursive: true });
const out = join(root, 'release', `convertly-${pkg.version}.zip`);
writeFileSync(out, zipped);
console.log(`Wrote ${out} (${(zipped.length / 1024).toFixed(1)} KB)`);
