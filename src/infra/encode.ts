import type { FormatId } from '@core/types';

// png is NOT here — it's encoded via UPNG below (smaller + quality-aware).
const MIME: Partial<Record<FormatId, string>> = {
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

const DEFAULT_QUALITY = 0.9;

/**
 * Encode an ImageBitmap to the target raster format.
 *  - jpeg/png/webp: native canvas encoder (quality applies to jpeg/webp).
 *  - bmp:  hand-encoded from pixels, no dependency (lossless).
 *  - avif: @jsquash/avif WASM encoder (lazy-loaded; quality 0..1 -> 0..100).
 *  - tiff: utif2 encoder (lazy-loaded; uncompressed, lossless).
 */
export async function encodeBlob(
  bitmap: ImageBitmap,
  format: FormatId,
  quality: number = DEFAULT_QUALITY,
  resize = 1,
  resizeMode = 'percent',
  resizeMaxPx = 0,
): Promise<Blob> {
  let scale = 1;
  if (resizeMode === 'maxside' && resizeMaxPx > 0) {
    // Cap the longest side; never upscale.
    const longest = Math.max(bitmap.width, bitmap.height);
    if (longest > resizeMaxPx) scale = resizeMaxPx / longest;
  } else if (resize > 0 && resize < 1) {
    scale = resize;
  }
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not get 2D canvas context');
  }
  ctx.drawImage(bitmap, 0, 0, w, h);

  // Native canvas encoders.
  const mime = MIME[format];
  if (mime) {
    return canvas.convertToBlob({ type: mime, quality });
  }

  // Pixel-based encoders need the raw RGBA.
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  switch (format) {
    case 'png': {
      // UPNG: lossless at quality 1, else quantise to a palette (smaller PNG,
      // staying PNG). This is the "optimise PNG" path the canvas can't do.
      const { default: UPNG } = await import('upng-js');
      const colors = quality >= 1 ? 0 : Math.min(256, Math.max(2, Math.round(quality * 256)));
      const rgba = imageData.data.buffer as ArrayBuffer;
      const buf = UPNG.encode([rgba], canvas.width, canvas.height, colors);
      return new Blob([buf], { type: 'image/png' });
    }
    case 'bmp':
      return new Blob([encodeBmp(imageData)], { type: 'image/bmp' });
    case 'avif': {
      // Import the encode subpath only — the package index also pulls in the
      // AVIF *decoder* (avif_dec.wasm, ~1.17 MB) which we never use (the browser
      // decodes AVIF natively via createImageBitmap).
      const { default: encode } = await import('@jsquash/avif/encode.js');
      const buf = await encode(imageData, { quality: Math.round(quality * 100) });
      return new Blob([buf], { type: 'image/avif' });
    }
    case 'tiff': {
      const mod = await import('utif2');
      const UTIF = (mod as unknown as { default?: typeof mod }).default ?? mod;
      const rgba = new Uint8Array(imageData.data.buffer.slice(0));
      const buf = UTIF.encodeImage(rgba, imageData.width, imageData.height);
      return new Blob([buf], { type: 'image/tiff' });
    }
    default:
      throw new Error(`Cannot encode to format "${format}"`);
  }
}

/**
 * Encode RGBA ImageData to a 32-bit BMP (BITMAPINFOHEADER, BI_RGB, bottom-up).
 * 32bpp needs no row padding. Alpha is stored but most viewers treat it as BGRX.
 */
export function encodeBmp(img: ImageData): ArrayBuffer {
  const { width, height, data } = img;
  const pixelBytes = width * height * 4;
  const fileHeader = 14;
  const infoHeader = 40;
  const offset = fileHeader + infoHeader;
  const fileSize = offset + pixelBytes;

  const buf = new ArrayBuffer(fileSize);
  const view = new DataView(buf);

  // BITMAPFILEHEADER
  view.setUint8(0, 0x42); // 'B'
  view.setUint8(1, 0x4d); // 'M'
  view.setUint32(2, fileSize, true);
  view.setUint32(6, 0, true); // reserved
  view.setUint32(10, offset, true);

  // BITMAPINFOHEADER
  view.setUint32(14, infoHeader, true);
  view.setInt32(18, width, true);
  view.setInt32(22, height, true); // positive => bottom-up
  view.setUint16(26, 1, true); // planes
  view.setUint16(28, 32, true); // bits per pixel
  view.setUint32(30, 0, true); // BI_RGB
  view.setUint32(34, pixelBytes, true);
  view.setInt32(38, 2835, true); // ~72 DPI
  view.setInt32(42, 2835, true);
  view.setUint32(46, 0, true); // colors used
  view.setUint32(50, 0, true); // colors important

  // Pixels: RGBA (top-down) -> BGRA, written bottom-up.
  const out = new Uint8Array(buf);
  for (let y = 0; y < height; y++) {
    const srcRow = y * width * 4;
    const dstRow = offset + (height - 1 - y) * width * 4;
    for (let x = 0; x < width; x++) {
      const s = srcRow + x * 4;
      const d = dstRow + x * 4;
      out[d] = data[s + 2]; // B
      out[d + 1] = data[s + 1]; // G
      out[d + 2] = data[s]; // R
      out[d + 3] = data[s + 3]; // A
    }
  }

  return buf;
}
