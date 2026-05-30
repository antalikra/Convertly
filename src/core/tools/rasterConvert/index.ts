import type { Tool, OutputFile, FormatId } from '../../types';
import { encodeBlob } from '@infra/encode';
import { renameForFormat } from '@shared/filenames';

// Formats the browser can decode natively via createImageBitmap (no library).
const RASTER_INPUTS: FormatId[] = ['jpeg', 'png', 'webp', 'gif', 'bmp', 'avif'];

/**
 * Convert any common raster image the browser can decode (JPG/PNG/WebP/GIF/BMP)
 * to JPG/PNG/WebP. No extra dependency: the browser decodes, the canvas
 * re-encodes. HEIC is NOT handled here — that needs libheif (heicConvertTool).
 *
 * Note: animated GIFs convert their first frame only (single-image output).
 */
export const rasterConvertTool: Tool = {
  id: 'raster-convert',
  title: 'Image → JPG / PNG / WebP',
  category: 'image-convert',
  inputFormats: RASTER_INPUTS,
  outputFormats: ['jpeg', 'png', 'webp', 'avif', 'tiff', 'bmp'],
  accepts: (i) => RASTER_INPUTS.includes(i.detectedFormat as FormatId),

  async run(inputs, options, onProgress) {
    const results: OutputFile[] = [];

    for (const input of inputs) {
      let bitmap: ImageBitmap | undefined;
      try {
        onProgress?.({ inputId: input.id, stage: 'decoding' });
        bitmap = await createImageBitmap(input.file);

        onProgress?.({ inputId: input.id, stage: 'encoding' });
        const blob = await encodeBlob(bitmap, options.outputFormat, options.quality, options.resize);

        results.push({
          blob,
          fileName: renameForFormat(input.name, options.outputFormat),
          format: options.outputFormat,
        });
        onProgress?.({ inputId: input.id, stage: 'done' });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        onProgress?.({ inputId: input.id, stage: 'error', message });
      } finally {
        // Always free the bitmap — skipping close() on an encode throw leaks it.
        bitmap?.close();
      }
    }

    return results;
  },
};
