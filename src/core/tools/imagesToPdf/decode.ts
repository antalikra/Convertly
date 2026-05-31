import type { InputFile } from '../../types';

/**
 * Decode ANY supported image to an ImageBitmap for embedding. Dispatches to the
 * existing per-format decoders (HEIC via libheif, TIFF via utif2) and falls back
 * to the browser's native createImageBitmap for raster formats. Each heavy
 * decoder is lazy-imported so it only loads when such a file is present.
 */
export async function decodeToBitmap(input: InputFile): Promise<ImageBitmap> {
  const fmt = input.detectedFormat;
  if (fmt === 'heic' || fmt === 'heif') {
    const { decodeHeic } = await import('../heicConvert/decode');
    return decodeHeic(input.file);
  }
  if (fmt === 'tiff') {
    const { decodeTiff } = await import('../tiffConvert/decode');
    return decodeTiff(input.file);
  }
  // jpeg / png / webp / gif / bmp / avif — native, EXIF orientation applied.
  return createImageBitmap(input.file, { imageOrientation: 'from-image' });
}
