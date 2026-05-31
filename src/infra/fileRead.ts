import type { FormatId, InputFile } from '@core/types';

let counter = 0;
function nextId(): string {
  counter += 1;
  return `f${Date.now().toString(36)}-${counter}`;
}

/**
 * Detect image format from the file's magic bytes, falling back to extension.
 * HEIC/HEIF use the ISO-BMFF container: bytes 4..8 are "ftyp", followed by a
 * brand such as heic/heix/mif1/heif.
 */
export async function detectFormat(file: File): Promise<FormatId | 'unknown'> {
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());

  const ascii = (start: number, end: number) =>
    String.fromCharCode(...head.subarray(start, end));

  if (ascii(4, 8) === 'ftyp') {
    const brand = ascii(8, 12).toLowerCase();
    if (brand.startsWith('avif') || brand.startsWith('avis')) return 'avif';
    if (brand.startsWith('hei') || brand === 'mif1' || brand === 'msf1') return 'heic';
    if (brand.startsWith('hev') || brand.startsWith('heif')) return 'heif';
  }

  // PDF: "%PDF-"
  if (ascii(0, 5) === '%PDF-') return 'pdf';
  // JPEG: FF D8 FF
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'jpeg';
  // PNG: 89 50 4E 47
  if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return 'png';
  // RIFF container: WebP (image) or WAV (audio)
  if (ascii(0, 4) === 'RIFF') {
    if (ascii(8, 12) === 'WEBP') return 'webp';
    if (ascii(8, 12) === 'WAVE') return 'wav';
  }
  // Audio signatures
  if (ascii(0, 4) === 'fLaC') return 'flac';
  if (ascii(0, 4) === 'OggS') return 'ogg';
  if (ascii(0, 3) === 'ID3') return 'mp3'; // ID3-tagged MP3
  if (head[0] === 0xff && (head[1] & 0xe0) === 0xe0) return 'mp3'; // MPEG frame sync
  if (ascii(4, 8) === 'ftyp') {
    // Only the explicit M4A brand — avoid misreading MP4 video (isom/mp42).
    if (ascii(8, 12).toLowerCase().startsWith('m4a')) return 'm4a';
  }
  // GIF: "GIF87a" / "GIF89a"
  if (ascii(0, 3) === 'GIF') return 'gif';
  // BMP: "BM"
  if (head[0] === 0x42 && head[1] === 0x4d) return 'bmp';
  // TIFF: "II*\0" (little-endian) or "MM\0*" (big-endian)
  if (
    (head[0] === 0x49 && head[1] === 0x49 && head[2] === 0x2a && head[3] === 0x00) ||
    (head[0] === 0x4d && head[1] === 0x4d && head[2] === 0x00 && head[3] === 0x2a)
  ) {
    return 'tiff';
  }

  // Extension fallback (some files have unusual or missing magic bytes).
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'heic') return 'heic';
  if (ext === 'heif') return 'heif';
  if (ext === 'jpg' || ext === 'jpeg') return 'jpeg';
  if (ext === 'png') return 'png';
  if (ext === 'webp') return 'webp';
  if (ext === 'gif') return 'gif';
  if (ext === 'bmp') return 'bmp';
  if (ext === 'avif') return 'avif';
  if (ext === 'tif' || ext === 'tiff') return 'tiff';
  if (ext === 'mp3') return 'mp3';
  if (ext === 'wav') return 'wav';
  if (ext === 'flac') return 'flac';
  if (ext === 'm4a') return 'm4a';
  if (ext === 'aac') return 'aac';
  if (ext === 'ogg' || ext === 'oga') return 'ogg';
  if (ext === 'pdf') return 'pdf';

  return 'unknown';
}

export async function toInputFile(file: File): Promise<InputFile> {
  return {
    id: nextId(),
    file,
    name: file.name,
    sizeBytes: file.size,
    detectedFormat: await detectFormat(file),
  };
}
