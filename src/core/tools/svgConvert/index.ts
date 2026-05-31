import type { Tool, FormatId, InputFile, OutputFile } from '../../types';
import { encodeBlob } from '@infra/encode';

const RASTER_OUTPUTS: FormatId[] = ['jpeg', 'png', 'webp', 'avif', 'tiff', 'bmp'];

/** Render an SVG to an ImageBitmap. SVG can't go through `createImageBitmap`
 *  reliably, so we load it into an <img> (blob URL) and paint it onto a canvas.
 *  Size = the SVG's intrinsic size, else its viewBox, else a 1024 fallback. */
async function decodeSvg(file: InputFile): Promise<ImageBitmap> {
  const text = await file.file.text();
  const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Could not decode SVG'));
      img.src = url;
    });
    let w = img.naturalWidth || img.width;
    let h = img.naturalHeight || img.height;
    if (!w || !h) {
      const vb = text.match(/viewBox\s*=\s*["']\s*[\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)/i);
      w = vb ? Math.ceil(Number(vb[1])) : 1024;
      h = vb ? Math.ceil(Number(vb[2])) : 1024;
    }
    // Vectors render crisply at any size — supersample small SVGs to ~2048px on
    // the longest side (capped at 4096) so the raster isn't blurry/tiny.
    const longest = Math.max(w, h) || 1;
    const scale = Math.min(4096, Math.max(longest, 2048)) / longest;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2D canvas context');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await createImageBitmap(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * SVG → raster (JPG/PNG/WebP/AVIF/TIFF/BMP). Vector input is rendered at its
 * intrinsic size, then encoded through the shared raster encoder (quality +
 * resize apply). 1→1.
 */
export const svgConvertTool: Tool = {
  id: 'svg-convert',
  title: 'SVG → image',
  category: 'image-convert',
  inputFormats: ['svg'],
  outputFormats: RASTER_OUTPUTS,
  accepts: (i) => i.detectedFormat === 'svg',

  async run(inputs, options, onProgress) {
    const results: OutputFile[] = [];
    for (const input of inputs) {
      let bitmap: ImageBitmap | undefined;
      try {
        onProgress?.({ inputId: input.id, stage: 'decoding' });
        bitmap = await decodeSvg(input);

        onProgress?.({ inputId: input.id, stage: 'encoding' });
        const blob = await encodeBlob(
          bitmap,
          options.outputFormat,
          options.quality,
          options.resize,
          options.resizeMode,
          options.resizeMaxPx,
        );
        results.push({
          blob,
          fileName: input.name.replace(/\.[^.]+$/, '') + '.' + extOf(options.outputFormat),
          format: options.outputFormat,
        });
        onProgress?.({ inputId: input.id, stage: 'done' });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        onProgress?.({ inputId: input.id, stage: 'error', message });
      } finally {
        bitmap?.close();
      }
    }
    return results;
  },
};

function extOf(format: FormatId): string {
  return format === 'jpeg' ? 'jpg' : format;
}
