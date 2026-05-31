import type { Tool, OutputFile } from '../../types';

/**
 * DOCX → PDF (1→1, **Beta**). Two modes via `options.docxMode`:
 *  - 'raster' (default): visual fidelity (images/layout), text not selectable.
 *  - 'reflow': selectable text via a bundled Unicode font; drops images/tables.
 * Both pipelines live in infra/docxRender (lazy-imported — heavy).
 */
export const docxToPdfTool: Tool = {
  id: 'docx-to-pdf',
  title: 'DOCX → PDF',
  category: 'pdf',
  inputFormats: ['docx'],
  outputFormats: ['pdf'],
  accepts: (i) => i.detectedFormat === 'docx',

  async run(inputs, options, onProgress) {
    const results: OutputFile[] = [];
    const mode = options.docxMode === 'reflow' ? 'reflow' : 'raster';
    const { docxToPdfRaster, docxToPdfReflow } = await import('@infra/docxRender');

    for (const input of inputs) {
      try {
        onProgress?.({ inputId: input.id, stage: 'decoding' });
        const bytes = mode === 'reflow'
          ? await docxToPdfReflow(input.file)
          : await docxToPdfRaster(input.file);

        onProgress?.({ inputId: input.id, stage: 'encoding' });
        results.push({
          blob: new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }),
          fileName: `${input.name.replace(/\.[^.]+$/, '')}.pdf`,
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
