import type { Tool, OutputFile } from '../../types';

/** Parse a page spec like "1-3, 5, 8-10" into 1-based page numbers, in the given
 *  order (so it doubles as reorder), clamped to [1, total]. Empty → all pages. */
function parseRange(spec: string, total: number): number[] {
  const out: number[] = [];
  for (const part of spec.split(',')) {
    const t = part.trim();
    if (!t) continue;
    const range = t.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      let a = Number(range[1]);
      let b = Number(range[2]);
      if (a > b) [a, b] = [b, a];
      for (let p = a; p <= b; p++) if (p >= 1 && p <= total) out.push(p);
    } else if (/^\d+$/.test(t)) {
      const p = Number(t);
      if (p >= 1 && p <= total) out.push(p);
    }
  }
  return out;
}

/**
 * Keep / reorder specific PDF pages (operation 'pages'). `options.pageRange`
 * (e.g. "1-3, 5, 8-10") selects the pages, in order — so it also deletes the
 * rest and can reorder. Empty/invalid spec keeps every page. 1→1 (pdf-lib).
 */
export const pdfPagesTool: Tool = {
  id: 'pdf-pages',
  title: 'PDF pages (extract / reorder)',
  category: 'pdf',
  operation: 'pages',
  inputFormats: ['pdf'],
  outputFormats: ['pdf'],
  accepts: (i) => i.detectedFormat === 'pdf',

  async run(inputs, options, onProgress) {
    const results: OutputFile[] = [];
    const { PDFDocument } = await import('pdf-lib');
    const spec = typeof options.pageRange === 'string' ? options.pageRange : '';

    for (const input of inputs) {
      try {
        onProgress?.({ inputId: input.id, stage: 'decoding' });
        const src = await PDFDocument.load(await input.file.arrayBuffer());
        const total = src.getPageCount();
        let nums = parseRange(spec, total);
        if (nums.length === 0) nums = Array.from({ length: total }, (_, i) => i + 1);

        const out = await PDFDocument.create();
        const copied = await out.copyPages(src, nums.map((n) => n - 1));
        for (const p of copied) out.addPage(p);

        onProgress?.({ inputId: input.id, stage: 'encoding' });
        const bytes = await out.save();
        results.push({
          blob: new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }),
          fileName: `${input.name.replace(/\.[^.]+$/, '')}-pages.pdf`,
          format: 'pdf',
        });
        onProgress?.({ inputId: input.id, stage: 'done' });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        onProgress?.({ inputId: input.id, stage: 'error', message });
      }
    }

    return results;
  },
};
