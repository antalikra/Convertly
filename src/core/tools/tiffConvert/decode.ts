// Lazy TIFF decoder (utif2, ~104 KB pure JS). The browser can't decode TIFF via
// createImageBitmap, so we decode to RGBA and wrap it in an ImageBitmap that the
// shared canvas encoder can re-encode to any output format.

export async function decodeTiff(file: File): Promise<ImageBitmap> {
  const mod = await import('utif2');
  const UTIF = (mod as unknown as { default?: typeof mod }).default ?? mod;

  const buffer = await file.arrayBuffer();
  const ifds = UTIF.decode(buffer);
  if (!ifds.length) throw new Error('No image found in TIFF');

  // Multi-page TIFF → first page only (ifds[0]), mirroring the animated-GIF
  // first-frame behaviour. Output is always a single image.
  const ifd = ifds[0];
  UTIF.decodeImage(buffer, ifd);
  const rgba = UTIF.toRGBA8(ifd); // Uint8Array, RGBA

  // Copy into a fresh ArrayBuffer-backed clamped array (avoids SharedArrayBuffer
  // typing and any view offset from utif2's internal buffer).
  const imageData = new ImageData(Uint8ClampedArray.from(rgba), ifd.width, ifd.height);
  return createImageBitmap(imageData);
}
