import { loadHeicDecoder } from '@infra/heicDecoder';

/**
 * Decode a HEIC/HEIF File into an ImageBitmap the canvas encoder can re-encode
 * to any target format with quality control.
 *
 * Verified facts (heic-to v1.5.2 / libheif 1.22.2):
 *  - `type: 'bitmap'` returns an ImageBitmap directly (no PNG round-trip).
 *  - The decode runs inside heic-to's own internal Web Worker, so it does NOT
 *    block the UI thread.
 *  - Metadata (EXIF/GPS) is NOT carried into the raster output → stripped for
 *    free. EXIF orientation is applied by libheif's display() during decode.
 */
export async function decodeHeic(file: File): Promise<ImageBitmap> {
  const { heicTo } = await loadHeicDecoder();
  return heicTo({ blob: file, type: 'bitmap' });
}
