import type { Tool, FormatId } from '../../types';
import { decodeToBitmap } from './decode';

// Every image the app can decode — raster (native) plus HEIC/HEIF and TIFF via
// their own decoders (see ./decode). So HEIC photos can go straight to PDF.
const IMAGE_INPUTS: FormatId[] = [
  'jpeg', 'png', 'webp', 'gif', 'bmp', 'avif', 'heic', 'heif', 'tiff',
];

// JPEG quality used when flattening each image for embedding. PDF has no alpha,
// so transparency is composited onto white first.
const EMBED_QUALITY = 0.9;

/**
 * Combine images into one PDF, one image per page (N→1, aggregate). Each image is
 * decoded to an ImageBitmap (HEIC/TIFF via their decoders, others native),
 * flattened onto white, re-encoded as JPEG, and embedded with pdf-lib (lazy,
 * CSP-safe). Page size = image pixel size.
 */
export const imagesToPdfTool: Tool = {
  id: 'images-to-pdf',
  title: 'Images → PDF',
  category: 'pdf',
  aggregate: true,
  inputFormats: IMAGE_INPUTS,
  outputFormats: ['pdf'],
  accepts: (i) => IMAGE_INPUTS.includes(i.detectedFormat as FormatId),

  async run(inputs, _options, onProgress) {
    if (inputs.length === 0) return [];
    const { PDFDocument } = await import('pdf-lib');

    try {
      const doc = await PDFDocument.create();
      for (const input of inputs) {
        let bitmap: ImageBitmap | undefined;
        try {
          onProgress?.({ inputId: input.id, stage: 'decoding' });
          bitmap = await decodeToBitmap(input);

          const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('Could not get 2D canvas context');
          ctx.fillStyle = '#ffffff'; // flatten transparency (PDF/JPEG have no alpha)
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(bitmap, 0, 0);

          onProgress?.({ inputId: input.id, stage: 'encoding' });
          const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: EMBED_QUALITY });
          const img = await doc.embedJpg(new Uint8Array(await blob.arrayBuffer()));
          const page = doc.addPage([img.width, img.height]);
          page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
        } finally {
          bitmap?.close();
        }
      }
      const bytes = await doc.save();

      return [
        {
          blob: new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }),
          fileName: 'images.pdf',
          format: 'pdf',
        },
      ];
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      for (const input of inputs) onProgress?.({ inputId: input.id, stage: 'error', message });
      return [];
    }
  },
};
