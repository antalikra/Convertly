import type { Tool, OutputFile } from '../../types';
import { renderPdfPages } from '@infra/pdfRender';

const DEFAULT_SCALE = 1.5; // render scale when none supplied (size/quality trade-off)
const JPEG_QUALITY = 0.7; // re-encode quality for the flattened pages

/**
 * "Compress" a PDF by rasterising it (pdf.js renders each page → JPEG → new PDF
 * via pdf-lib). Shrinks heavy/image-laden PDFs a lot, but **flattens text to an
 * image** (no longer selectable) — that's the trade-off. `options.scale`
 * controls the render resolution. 1→1.
 */
export const pdfCompressTool: Tool = {
  id: 'pdf-compress',
  title: 'PDF compress (rasterise)',
  category: 'pdf',
  operation: 'compress',
  inputFormats: ['pdf'],
  outputFormats: ['pdf'],
  accepts: (i) => i.detectedFormat === 'pdf',

  async run(inputs, options, onProgress) {
    const results: OutputFile[] = [];
    const { PDFDocument } = await import('pdf-lib');
    const scale = typeof options.scale === 'number' && options.scale > 0 ? options.scale : DEFAULT_SCALE;

    for (const input of inputs) {
      try {
        onProgress?.({ inputId: input.id, stage: 'decoding' });
        const doc = await PDFDocument.create();
        await renderPdfPages(input.file, scale, async (_n, _total, canvas) => {
          const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY });
          const img = await doc.embedJpg(new Uint8Array(await blob.arrayBuffer()));
          // Canvas px ÷ scale = original page size in PDF points (72dpi base).
          const w = canvas.width / scale;
          const h = canvas.height / scale;
          const page = doc.addPage([w, h]);
          page.drawImage(img, { x: 0, y: 0, width: w, height: h });
        });

        onProgress?.({ inputId: input.id, stage: 'encoding' });
        const bytes = await doc.save();
        results.push({
          blob: new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }),
          fileName: `${input.name.replace(/\.[^.]+$/, '')}-compressed.pdf`,
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
