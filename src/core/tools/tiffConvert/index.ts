import type { Tool, OutputFile } from '../../types';
import { decodeTiff } from './decode';
import { encodeBlob } from '@infra/encode';
import { renameForFormat } from '@shared/filenames';

/**
 * TIFF in → JPG/PNG/WebP/AVIF/TIFF/BMP. TIFF isn't decodable by the browser's
 * createImageBitmap, so this tool owns the libheif-style lazy decode (utif2).
 */
export const tiffConvertTool: Tool = {
  id: 'tiff-convert',
  title: 'TIFF → JPG / PNG / WebP / …',
  category: 'image-convert',
  inputFormats: ['tiff'],
  outputFormats: ['jpeg', 'png', 'webp', 'avif', 'tiff', 'bmp'],
  accepts: (i) => i.detectedFormat === 'tiff',

  async run(inputs, options, onProgress) {
    const results: OutputFile[] = [];

    for (const input of inputs) {
      let bitmap: ImageBitmap | undefined;
      try {
        onProgress?.({ inputId: input.id, stage: 'decoding' });
        bitmap = await decodeTiff(input.file);

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
