// DOCX → PDF — best-effort, Beta. Two pipelines:
//  - raster: mammoth (DOCX→HTML) → html2canvas (rasterise) → pdf-lib pages.
//    Keeps images/layout/Cyrillic (system fonts); text not selectable, heavier.
//  - reflow: mammoth (DOCX→HTML) → pdf-lib draws the text with a bundled Unicode
//    font (Roboto, has Cyrillic). Selectable + small; drops images/tables/layout.
// All deps are pure JS, no eval (CSP-safe). Lazy-imported (Beta, heavy).
//
// Note: the font is fetched from the extension's OWN packaged asset (same-origin,
// not a server/CDN) — the same pattern pdf.js uses for its worker.

import type { PDFFont } from 'pdf-lib';

async function docxToHtml(file: File): Promise<string> {
  const { default: mammoth } = await import('mammoth/mammoth.browser.js');
  const { value } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
  return value;
}

// ---- raster ---------------------------------------------------------------

const A4_PX_W = 794; // ≈ A4 width at 96dpi
const A4_RATIO = 1123 / 794; // height / width
const A4_PT_W = 595.28;
const A4_PT_H = A4_PT_W * A4_RATIO;

// Block-level elements we never slice through. Everything else (div, ul, ol,
// section…) is a layout wrapper we descend INTO to find these leaves.
const BLOCK_TAGS = new Set([
  'IMG', 'SVG', 'CANVAS', 'TABLE', 'FIGURE', 'P', 'H1', 'H2', 'H3', 'H4', 'H5',
  'H6', 'LI', 'PRE', 'BLOCKQUOTE', 'HR',
]);

/** Flatten the host into the laid-out leaf blocks (top/bottom in CSS px relative
 *  to the host top). These are the only places a page break may fall. */
function collectBlocks(host: HTMLElement): Array<{ top: number; bottom: number }> {
  const hostTop = host.getBoundingClientRect().top;
  const blocks: Array<{ top: number; bottom: number }> = [];
  const visit = (el: Element): void => {
    for (const child of Array.from(el.children)) {
      const node = child as HTMLElement;
      if (BLOCK_TAGS.has(node.tagName) || node.childElementCount === 0) {
        const top = node.getBoundingClientRect().top - hostTop;
        blocks.push({ top, bottom: top + node.offsetHeight });
      } else {
        visit(node); // descend into layout wrappers (div / ul / ol / section)
      }
    }
  };
  visit(host);
  blocks.sort((a, b) => a.top - b.top);
  return blocks;
}

/**
 * Cumulative page-break offsets (CSS px) that fall ONLY between blocks — never
 * through a paragraph, image, table or list item. Each page greedily packs the
 * blocks that fully fit; the break is the bottom of the last fitting block.
 * A single block taller than a full page is the one case we must hard-cut.
 */
function computePageBreaks(host: HTMLElement, maxPageH: number): number[] {
  const totalH = host.scrollHeight;
  const blocks = collectBlocks(host);

  const breaks: number[] = [];
  let start = 0;
  // Guard against pathological inputs.
  for (let guard = 0; guard < 5000 && start < totalH - 1; guard++) {
    const limit = start + maxPageH;
    if (limit >= totalH) {
      breaks.push(totalH);
      break;
    }
    // Bottom of the last block that fits entirely within [start, limit].
    let cut = 0;
    for (const b of blocks) {
      if (b.top >= start - 1 && b.bottom <= limit + 0.5 && b.bottom > cut) cut = b.bottom;
    }
    // Nothing fits (a block taller than one page, or one straddling from the
    // very start) → unavoidable hard cut at the page limit.
    if (cut <= start + 1) cut = limit;
    breaks.push(cut);
    start = cut;
  }
  return breaks;
}

/** Data-URI images report height only once decoded — wait so block measurement
 *  (and thus page breaks) see their real laid-out size. */
async function awaitImages(host: HTMLElement): Promise<void> {
  const imgs = Array.from(host.querySelectorAll('img'));
  await Promise.all(
    imgs.map((img) =>
      img.complete && img.naturalHeight > 0
        ? Promise.resolve()
        : new Promise<void>((res) => {
            img.addEventListener('load', () => res(), { once: true });
            img.addEventListener('error', () => res(), { once: true });
          }),
    ),
  );
}

export async function docxToPdfRaster(file: File): Promise<Uint8Array> {
  const html = await docxToHtml(file);
  const { default: html2canvas } = await import('html2canvas');
  const { PDFDocument } = await import('pdf-lib');

  // Render the HTML into a hidden, zero-size, overflow-clipped wrapper. NOT
  // position:fixed and NOT offscreen-negative/opacity:0 — html2canvas renders
  // those blank. The wrapper hides it (behind, clipped) without a flash; the host
  // itself lays out normally so html2canvas can paint its full content.
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;overflow:hidden;z-index:-1;';
  const host = document.createElement('div');
  // `.docx-render-host` rules in app.css clamp images/tables to the page width.
  host.className = 'docx-render-host';
  host.style.cssText =
    `width:${A4_PX_W}px;padding:40px;box-sizing:border-box;background:#fff;color:#000;` +
    `font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;`;
  host.innerHTML = html;
  wrap.appendChild(host);
  document.body.appendChild(wrap);

  try {
    await awaitImages(host); // heights must be final before we measure breaks
    const pageCssH = Math.round(A4_PX_W * A4_RATIO);
    const breaks = computePageBreaks(host, pageCssH);
    const doc = await PDFDocument.create();

    // One html2canvas crop per page (a single full-document canvas overflows the
    // browser's max-canvas-size limit and comes back blank). Pages stay A4-sized;
    // the slice is top-aligned with white below.
    let prev = 0;
    for (const br of breaks) {
      const h = Math.max(1, Math.round(br - prev));
      const canvas = await html2canvas(host, {
        backgroundColor: '#ffffff',
        scale: 2,
        logging: false,
        width: A4_PX_W,
        height: h,
        y: prev,
        windowWidth: A4_PX_W,
        windowHeight: h,
      });
      const blob: Blob = await new Promise((resolve) =>
        canvas.toBlob((b) => resolve(b as Blob), 'image/jpeg', 0.85),
      );
      const img = await doc.embedJpg(new Uint8Array(await blob.arrayBuffer()));
      const imgH = Math.min(A4_PT_H, A4_PT_W * (canvas.height / canvas.width));
      const page = doc.addPage([A4_PT_W, A4_PT_H]);
      page.drawImage(img, { x: 0, y: A4_PT_H - imgH, width: A4_PT_W, height: imgH });
      prev = br;
    }
    return doc.save();
  } finally {
    wrap.remove();
  }
}

// ---- reflow ---------------------------------------------------------------

let fontCache: { regular: Uint8Array; bold: Uint8Array } | undefined;

async function loadFonts(): Promise<{ regular: Uint8Array; bold: Uint8Array }> {
  if (!fontCache) {
    const regUrl = (await import('@expo-google-fonts/roboto/400Regular/Roboto_400Regular.ttf?url'))
      .default;
    const boldUrl = (await import('@expo-google-fonts/roboto/700Bold/Roboto_700Bold.ttf?url'))
      .default;
    const [r, b] = await Promise.all([fetch(regUrl), fetch(boldUrl)]);
    fontCache = {
      regular: new Uint8Array(await r.arrayBuffer()),
      bold: new Uint8Array(await b.arrayBuffer()),
    };
  }
  return fontCache;
}

interface Block {
  text: string;
  size: number;
  bold: boolean;
  prefix: string;
}

const HEADING_SIZE: Record<string, number> = { H1: 22, H2: 18, H3: 15, H4: 13, H5: 12, H6: 12 };

/** A paragraph is "bold" if (almost) all its text is inside <strong>/<b> — many
 *  theses style headings as a fully-bold paragraph rather than a Word Heading. */
function blockBold(el: Element): boolean {
  const txt = el.textContent?.trim() ?? '';
  if (!txt) return false;
  const strong = Array.from(el.querySelectorAll('strong,b'))
    .map((s) => s.textContent ?? '')
    .join('')
    .trim();
  return strong.length >= txt.length * 0.8;
}

/** Flatten mammoth's HTML into a linear list of text blocks (no inline styling). */
function htmlToBlocks(html: string): Block[] {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const out: Block[] = [];

  const walk = (el: Element, listPrefix: string): void => {
    for (const node of Array.from(el.children)) {
      const tag = node.tagName;
      if (tag === 'UL' || tag === 'OL') {
        walk(node, '•  ');
        continue;
      }
      if (tag === 'LI') {
        out.push({ text: node.textContent?.trim() ?? '', size: 11, bold: false, prefix: listPrefix });
        continue;
      }
      if (tag in HEADING_SIZE) {
        out.push({ text: node.textContent?.trim() ?? '', size: HEADING_SIZE[tag], bold: true, prefix: '' });
        continue;
      }
      if (tag === 'TABLE') {
        for (const row of Array.from(node.querySelectorAll('tr'))) {
          const cells = Array.from(row.querySelectorAll('td,th'))
            .map((c) => c.textContent?.trim() ?? '')
            .join('   |   ');
          out.push({ text: cells, size: 11, bold: false, prefix: '' });
        }
        continue;
      }
      out.push({ text: node.textContent?.trim() ?? '', size: 11, bold: blockBold(node), prefix: '' });
    }
  };

  walk(parsed.body, '');
  return out;
}

/** Word-wrap (with hard char-break for over-long words) to a max width. */
function wrapText(text: string, font: PDFFont, size: number, maxW: number): string[] {
  const widthOf = (s: string) => font.widthOfTextAtSize(s, size);
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const test = line ? `${line} ${word}` : word;
    if (widthOf(test) <= maxW) {
      line = test;
      continue;
    }
    if (line) lines.push(line);
    if (widthOf(word) > maxW) {
      let chunk = '';
      for (const ch of word) {
        if (chunk && widthOf(chunk + ch) > maxW) {
          lines.push(chunk);
          chunk = ch;
        } else {
          chunk += ch;
        }
      }
      line = chunk;
    } else {
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function docxToPdfReflow(file: File): Promise<Uint8Array> {
  const html = await docxToHtml(file);
  const { PDFDocument, rgb } = await import('pdf-lib');
  const { default: fontkit } = await import('@pdf-lib/fontkit');
  const fonts = await loadFonts();

  const doc = await PDFDocument.create();
  // pdf-lib needs fontkit to embed a custom (Unicode) TTF.
  doc.registerFontkit(fontkit as Parameters<typeof doc.registerFontkit>[0]);
  const regular = await doc.embedFont(fonts.regular, { subset: true });
  const bold = await doc.embedFont(fonts.bold, { subset: true });

  const W = 595.28;
  const H = 841.89;
  const M = 50;
  const maxW = W - 2 * M;
  let page = doc.addPage([W, H]);
  let y = H - M;

  for (const b of htmlToBlocks(html)) {
    const font = b.bold ? bold : regular;
    const lineH = b.size * 1.4;
    const text = `${b.prefix}${b.text}`;
    if (!text.trim()) {
      y -= lineH * 0.6;
      continue;
    }
    for (const line of wrapText(text, font, b.size, maxW)) {
      if (y - lineH < M) {
        page = doc.addPage([W, H]);
        y = H - M;
      }
      page.drawText(line, { x: M, y: y - b.size, size: b.size, font, color: rgb(0.1, 0.1, 0.1) });
      y -= lineH;
    }
    y -= b.size * 0.45; // paragraph gap
  }

  return doc.save();
}
