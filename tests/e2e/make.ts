// Small input files built on the fly, so the tests need no binary fixtures except the HEIC
// photo (browsers cannot encode HEIC).
import { deflateSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { zipSync, strToU8 } from 'fflate';

const require = createRequire(import.meta.url);

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(b: Buffer): number {
  let c = 0xffffffff;
  for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** An RGBA gradient PNG with a transparent corner. */
export function png(name: string, w = 320, h = 200) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const o = y * (w * 4 + 1) + 1 + x * 4;
      raw[o] = (x * 255) / w;
      raw[o + 1] = (y * 255) / h;
      raw[o + 2] = 180;
      raw[o + 3] = x < 40 && y < 40 ? 0 : 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const buffer = Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return { name, mimeType: 'image/png', buffer };
}

/** A stereo 16-bit WAV with a fading 440 Hz tone. */
export function wav(name: string, seconds = 3, rate = 44100) {
  const n = rate * seconds;
  const b = Buffer.alloc(44 + n * 4);
  b.write('RIFF', 0, 'latin1');
  b.writeUInt32LE(36 + n * 4, 4);
  b.write('WAVEfmt ', 8, 'latin1');
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(2, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 4, 28);
  b.writeUInt16LE(4, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36, 'latin1');
  b.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    const v = Math.round(Math.sin((i / rate) * 2 * Math.PI * 440) * 9000 * (1 - i / n));
    b.writeInt16LE(v, 44 + i * 4);
    b.writeInt16LE(v, 46 + i * 4);
  }
  return { name, mimeType: 'audio/wav', buffer: b };
}

/** A text PDF with `pages` pages, each saying its number. */
export async function pdf(name: string, pages: number) {
  const { PDFDocument, StandardFonts } = require('pdf-lib') as typeof import('pdf-lib');
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= pages; i++) {
    const p = doc.addPage([595, 842]);
    p.drawText(`${name} page ${i}`, { x: 60, y: 760, size: 22, font });
  }
  return { name, mimeType: 'application/pdf', buffer: Buffer.from(await doc.save()) };
}

/** A minimal Word document with a heading and a Cyrillic line. */
export function docx(name: string) {
  const body = ['Meeting notes', 'Budget, hiring, launch plan.', 'Привет — Cyrillic check.']
    .map((t) => `<w:p><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`)
    .join('');
  const zip = zipSync({
    '[Content_Types].xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    ),
    '_rels/.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    ),
    'word/document.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`,
    ),
  });
  return { name, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: Buffer.from(zip) };
}

/** Width and height from a JPEG's SOF marker. */
export function jpegSize(b: Buffer): { width: number; height: number } {
  let i = 2;
  while (i < b.length) {
    const marker = b[i + 1];
    const len = b.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc3) return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  throw new Error('no SOF marker');
}

/** Number of pages in a PDF (pdf-lib). */
export async function pdfPages(b: Buffer): Promise<number> {
  const { PDFDocument } = require('pdf-lib') as typeof import('pdf-lib');
  return (await PDFDocument.load(b)).getPageCount();
}
