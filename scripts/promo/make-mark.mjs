// Renders the Convertly mark (squircle + C-with-arrows glyph) to a single PNG,
// seam-free, for the promo tiles to <img>. Same coverage-union renderer as
// scripts/make-icons.mjs (the arc + arrowheads are one mask → no junction seam,
// which the two-shape SVG version showed). Output: scripts/promo/mark.png (320px,
// transparent outside the squircle).
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SIZE = 320;
const OUT = join(process.cwd(), 'scripts', 'promo', 'mark.png');

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

const A = [0x5b, 0x8c, 0xff];
const B = [0x9b, 0x6b, 0xff];
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

function roundedCoverage(x, y, size, rFrac) {
  const r = rFrac * size;
  const cx = Math.min(Math.max(x, r), size - r);
  const cy = Math.min(Math.max(y, r), size - r);
  const d = Math.hypot(x - cx, y - cy);
  return clamp01(r - d + 0.5);
}

const edge = (px, py, ax, ay, bx, by) => (px - bx) * (ay - by) - (ax - bx) * (py - by);
function inTriangle(px, py, a, b, c) {
  const d1 = edge(px, py, a[0], a[1], b[0], b[1]);
  const d2 = edge(px, py, b[0], b[1], c[0], c[1]);
  const d3 = edge(px, py, c[0], c[1], a[0], a[1]);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}
function glyph(nx, ny) {
  const dx = nx - 0.5, dy = ny - 0.5;
  const r = Math.hypot(dx, dy);
  const a = Math.atan2(dy, dx);
  const ringR = 0.27, half = 0.075, gap = 0.95;
  if (Math.abs(r - ringR) <= half && Math.abs(a) > gap) return 1;
  const s = Math.sin(gap), c = Math.cos(gap);
  const flare = 0.05, len = 0.17;
  for (const sgn of [-1, 1]) {
    const inR = ringR - half - flare;
    const outR = ringR + half + flare;
    const inner = [0.5 + inR * c, 0.5 + inR * sgn * s];
    const outer = [0.5 + outR * c, 0.5 + outR * sgn * s];
    const mx = 0.5 + ringR * c, my = 0.5 + ringR * sgn * s;
    const apex = [mx + s * len, my - sgn * c * len];
    if (inTriangle(nx, ny, inner, outer, apex)) return 1;
  }
  return 0;
}

function makePng(size) {
  const ss = 3;
  const S = size * ss;
  const acc = new Float32Array(size * size * 4);
  for (let Y = 0; Y < S; Y++) {
    for (let X = 0; X < S; X++) {
      const cov = roundedCoverage(X / ss, Y / ss, size, 0.26);
      let r = 0, g = 0, b = 0, a = 0;
      if (cov > 0) {
        const t = (X + Y) / (2 * S);
        r = A[0] + (B[0] - A[0]) * t;
        g = A[1] + (B[1] - A[1]) * t;
        b = A[2] + (B[2] - A[2]) * t;
        if (glyph(X / S, Y / S)) r = g = b = 255;
        a = 255 * cov;
      }
      const px = (Math.floor(Y / ss) * size + Math.floor(X / ss)) * 4;
      acc[px] += r; acc[px + 1] += g; acc[px + 2] += b; acc[px + 3] += a;
    }
  }
  const n = ss * ss;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0;
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      raw[p++] = Math.round(acc[i] / n);
      raw[p++] = Math.round(acc[i + 1] / n);
      raw[p++] = Math.round(acc[i + 2] / n);
      raw[p++] = Math.round(acc[i + 3] / n);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

writeFileSync(OUT, makePng(SIZE));
console.log(`wrote ${OUT} (${SIZE}px)`);
