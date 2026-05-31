import type { Tool, OutputFile } from '../../types';
import { renameForFormat } from '@shared/filenames';

/** Snap to a legal pdf-lib rotation (multiple of 90, 0..270). */
function normalizeAngle(angle: number | undefined): number {
  const a = Math.round((angle ?? 90) / 90) * 90;
  return ((a % 360) + 360) % 360;
}

/**
 * Rotate every page of a PDF clockwise by `options.rotateAngle` (90/180/270).
 * Uses pdf-lib (pure JS, no WASM/eval → CSP-safe) — lazy-imported so it only
 * loads when a PDF is converted. The rotation is added to each page's existing
 * rotation, so a page already at 90° + a 90° request lands at 180°.
 *
 * 1→1: no metadata is re-encoded from pixels (unlike the raster path); pdf-lib
 * only rewrites the page's /Rotate entry, so text and images stay intact.
 */
export const pdfRotateTool: Tool = {
  id: 'pdf-rotate',
  title: 'Rotate PDF',
  category: 'pdf',
  operation: 'rotate',
  inputFormats: ['pdf'],
  outputFormats: ['pdf'],
  accepts: (i) => i.detectedFormat === 'pdf',

  async run(inputs, options, onProgress) {
    const results: OutputFile[] = [];
    const angle = normalizeAngle(options.rotateAngle);
    const { PDFDocument, degrees } = await import('pdf-lib');

    for (const input of inputs) {
      try {
        onProgress?.({ inputId: input.id, stage: 'decoding' });
        const doc = await PDFDocument.load(await input.file.arrayBuffer());

        onProgress?.({ inputId: input.id, stage: 'encoding' });
        for (const page of doc.getPages()) {
          const current = page.getRotation().angle;
          page.setRotation(degrees((current + angle) % 360));
        }
        const bytes = await doc.save();

        results.push({
          // Copy into a fresh ArrayBuffer-backed view so Blob gets a clean BlobPart
          // (pdf-lib's Uint8Array is typed over ArrayBufferLike).
          blob: new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }),
          fileName: renameForFormat(input.name, 'pdf'),
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
