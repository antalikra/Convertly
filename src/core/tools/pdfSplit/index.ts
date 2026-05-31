import type { Tool, OutputFile } from '../../types';

/** "report.pdf" → "report" (strip the final extension). */
function baseName(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? name : name.slice(0, dot);
}

/**
 * Split a PDF into one single-page PDF per page (1→N). Uses pdf-lib
 * (lazy-imported, CSP-safe). Each page is copied into a fresh document so the
 * output is a real standalone PDF, not a sliced byte range.
 *
 * Output names: `<base>-01.pdf`, `<base>-02.pdf`, … zero-padded to the page
 * count so a 12-page split sorts correctly in a file manager.
 */
export const pdfSplitTool: Tool = {
  id: 'pdf-split',
  title: 'Split PDF pages',
  category: 'pdf',
  operation: 'split',
  inputFormats: ['pdf'],
  outputFormats: ['pdf'],
  accepts: (i) => i.detectedFormat === 'pdf',

  async run(inputs, _options, onProgress) {
    const results: OutputFile[] = [];
    const { PDFDocument } = await import('pdf-lib');

    for (const input of inputs) {
      try {
        onProgress?.({ inputId: input.id, stage: 'decoding' });
        const src = await PDFDocument.load(await input.file.arrayBuffer());
        const count = src.getPageCount();

        onProgress?.({ inputId: input.id, stage: 'encoding' });
        const base = baseName(input.name);
        const pad = String(count).length;
        for (let i = 0; i < count; i++) {
          const out = await PDFDocument.create();
          const [page] = await out.copyPages(src, [i]);
          out.addPage(page);
          const bytes = await out.save();
          results.push({
            blob: new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }),
            fileName: `${base}-${String(i + 1).padStart(pad, '0')}.pdf`,
            format: 'pdf',
          });
        }
        onProgress?.({ inputId: input.id, stage: 'done' });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        onProgress?.({ inputId: input.id, stage: 'error', message });
      }
    }

    return results;
  },
};
