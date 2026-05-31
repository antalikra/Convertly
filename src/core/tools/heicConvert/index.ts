import type { Tool, OutputFile } from '../../types';
import { decodeHeic } from './decode';
import { encodeBlob } from '@infra/encode';
import { renameForFormat } from '@shared/filenames';

export const heicConvertTool: Tool = {
  id: 'heic-convert',
  title: 'HEIC → JPG / PNG / WebP',
  category: 'image-convert',
  inputFormats: ['heic', 'heif'],
  outputFormats: ['jpeg', 'png', 'webp', 'avif', 'tiff', 'bmp'],
  accepts: (i) => i.detectedFormat === 'heic' || i.detectedFormat === 'heif',

  async run(inputs, options, onProgress) {
    const results: OutputFile[] = [];

    // Sequential on purpose: a batch of 50 photos decoded at once can OOM the
    // tab (PLAN §2.5). One at a time, with per-file progress.
    for (const input of inputs) {
      let bitmap: ImageBitmap | undefined;
      try {
        onProgress?.({ inputId: input.id, stage: 'decoding' });
        bitmap = await decodeHeic(input.file);

        onProgress?.({ inputId: input.id, stage: 'encoding' });
        const blob = await encodeBlob(bitmap, options.outputFormat, options.quality, options.resize, options.resizeMode, options.resizeMaxPx);

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
