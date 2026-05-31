import type { Tool } from '../../types';

/**
 * Merge several PDFs into one (N→1, aggregate). Pages are appended in the order
 * the inputs arrive (the file-list order). Uses pdf-lib (lazy, CSP-safe).
 *
 * As an aggregate tool, `run` receives ALL selected PDFs at once and returns a
 * single combined file — the controller groups the inputs rather than looping.
 */
export const pdfMergeTool: Tool = {
  id: 'pdf-merge',
  title: 'Merge PDFs',
  category: 'pdf',
  operation: 'merge',
  aggregate: true,
  inputFormats: ['pdf'],
  outputFormats: ['pdf'],
  accepts: (i) => i.detectedFormat === 'pdf',

  async run(inputs, _options, onProgress) {
    if (inputs.length === 0) return [];
    const { PDFDocument } = await import('pdf-lib');

    try {
      const merged = await PDFDocument.create();
      for (const input of inputs) {
        onProgress?.({ inputId: input.id, stage: 'decoding' });
        const src = await PDFDocument.load(await input.file.arrayBuffer());
        const pages = await merged.copyPages(src, src.getPageIndices());
        for (const page of pages) merged.addPage(page);
        onProgress?.({ inputId: input.id, stage: 'encoding' });
      }
      const bytes = await merged.save();

      // One combined file; named after the first input so it's recognisable.
      const firstBase = inputs[0].name.replace(/\.[^.]+$/, '');
      return [
        {
          blob: new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }),
          fileName: `${firstBase}-merged.pdf`,
          format: 'pdf',
        },
      ];
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Surface the failure on every input that fed the merge.
      for (const input of inputs) onProgress?.({ inputId: input.id, stage: 'error', message });
      return [];
    }
  },
};
