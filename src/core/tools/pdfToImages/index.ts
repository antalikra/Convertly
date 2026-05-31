import type { Tool, OutputFile, FormatId } from '../../types';
import { renderPdfPages } from '@infra/pdfRender';

const OUTPUTS: FormatId[] = ['jpeg', 'png'];
const MIME: Record<string, string> = { jpeg: 'image/jpeg', png: 'image/png' };
const EXT: Record<string, string> = { jpeg: 'jpg', png: 'png' };

// Fallback render scale when none is supplied (≈ retina).
const DEFAULT_SCALE = 2;

/**
 * Render each PDF page to an image (1→N). Uses pdf.js (lazy, self-hosted worker —
 * see infra/pdfRender) to rasterise; the page canvas is encoded to JPG/PNG via
 * OffscreenCanvas. Output names: `<base>-p01.jpg`, … zero-padded to page count.
 */
export const pdfToImagesTool: Tool = {
  id: 'pdf-to-images',
  title: 'PDF → Images',
  category: 'pdf',
  inputFormats: ['pdf'],
  outputFormats: OUTPUTS,
  accepts: (i) => i.detectedFormat === 'pdf',

  async run(inputs, options, onProgress) {
    const results: OutputFile[] = [];
    const fmt = options.outputFormat === 'png' ? 'png' : 'jpeg';
    const scale = options.scale && options.scale > 0 ? options.scale : DEFAULT_SCALE;

    for (const input of inputs) {
      try {
        onProgress?.({ inputId: input.id, stage: 'decoding' });
        const base = input.name.replace(/\.[^.]+$/, '');
        const pages: Array<{ n: number; blob: Blob }> = [];
        let total = 0;

        await renderPdfPages(input.file, scale, async (n, t, canvas) => {
          total = t;
          if (n === 1) onProgress?.({ inputId: input.id, stage: 'encoding' });
          const blob = await canvas.convertToBlob({ type: MIME[fmt], quality: options.quality ?? 0.92 });
          pages.push({ n, blob });
        });

        const pad = String(total).length;
        for (const p of pages) {
          results.push({
            blob: p.blob,
            fileName: `${base}-p${String(p.n).padStart(pad, '0')}.${EXT[fmt]}`,
            format: fmt,
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
