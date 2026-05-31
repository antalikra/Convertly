// Core domain types. Layers communicate ONLY through these plain data types
// (Golden rule #3). No DOM, no chrome.*, no library types leak across here.

export type FormatId =
  // images
  | 'heic'
  | 'heif'
  | 'jpeg'
  | 'png'
  | 'webp'
  | 'gif'
  | 'bmp'
  | 'avif'
  | 'tiff'
  | 'svg'
  // audio
  | 'wav'
  | 'mp3'
  | 'flac'
  | 'm4a'
  | 'aac'
  | 'ogg'
  // documents
  | 'pdf'
  | 'txt'
  | 'html'
  | 'docx';

export type Category = 'image' | 'audio' | 'document';

/** Canonical display order for output-format buttons (filtered per input). */
export const OUTPUT_ORDER: readonly FormatId[] = [
  'jpeg',
  'png',
  'webp',
  'avif',
  'tiff',
  'bmp',
  'wav',
  'mp3',
  'pdf',
];

/** PDF rotation choices (degrees). pdf-lib requires multiples of 90. */
export const ROTATE_ANGLES: readonly number[] = [90, 180, 270];

/** PDF → image render scales (× base resolution). Bigger = sharper but heavier. */
export const PDF_SCALES: readonly number[] = [1, 1.5, 2];

/** Max-longest-side presets (px) for the "Max side" resize mode (downscale only). */
export const RESIZE_MAX: readonly number[] = [640, 1280, 1920, 2560, 4096];

/** Formats whose quality slider matters. png is here because UPNG uses quality
 *  as a palette-quantisation level (1 = lossless, lower = fewer colours/smaller). */
export const LOSSY_FORMATS: readonly FormatId[] = ['jpeg', 'webp', 'avif', 'png', 'mp3'];

const AUDIO: readonly FormatId[] = ['wav', 'mp3', 'flac', 'm4a', 'aac', 'ogg'];
const DOCUMENT: readonly FormatId[] = ['pdf', 'docx'];

export function formatCategory(format: FormatId): Category {
  if (DOCUMENT.includes(format)) return 'document';
  return AUDIO.includes(format) ? 'audio' : 'image';
}

/** Category of an input file, or null if its format is unknown/unsupported. */
export function inputCategory(input: InputFile): Category | null {
  return input.detectedFormat === 'unknown' ? null : formatCategory(input.detectedFormat);
}

export const CATEGORY_ORDER: readonly Category[] = ['image', 'audio', 'document'];

export interface InputFile {
  id: string;
  file: File;
  name: string;
  sizeBytes: number;
  detectedFormat: FormatId | 'unknown';
  /** Duration in seconds for audio inputs (read from metadata on add). */
  durationSec?: number;
}

export interface OutputFile {
  blob: Blob;
  fileName: string; // "IMG_1234.jpg"
  format: FormatId;
}

export interface ToolOptions {
  outputFormat: FormatId;
  quality?: number; // 0..1 for jpeg/webp
  trimStart?: number; // audio: trim start (seconds)
  trimEnd?: number; // audio: trim end (seconds); 0 = until the end
  audioMono?: boolean; // audio: mix down to mono
  normalize?: boolean; // audio: peak-normalize
  audioBitrate?: number; // audio: MP3 bitrate (kbps)
  resize?: number; // 0..1 scale factor for image output; 1 = original
  resizeMode?: string; // 'percent' (use resize) | 'maxside' (use resizeMaxPx)
  resizeMaxPx?: number; // longest-side cap in px for 'maxside' mode
  rotateAngle?: number; // PDF rotate: clockwise degrees (multiple of 90)
  scale?: number; // PDF → image render scale (× base resolution)
  docxMode?: string; // DOCX → PDF: 'raster' | 'reflow'
  pdfPageSize?: string; // images → PDF: 'fit' | 'a4' | 'letter'
  pdfOrientation?: string; // images → PDF: 'auto' | 'portrait' | 'landscape'
  pdfMargin?: number; // images → PDF: page margin in pt
  pageRange?: string; // PDF 'pages' op: pages to keep, e.g. "1-3, 5, 8-10"
  stampText?: string; // PDF 'stamp' op: watermark / stamp text
  stampPosition?: string; // 'center' (diagonal) | 'footer'
  stampPageNumbers?: boolean; // add page numbers
  operation?: string; // disambiguates tools sharing an output format (e.g. PDF rotate vs split)
  [key: string]: unknown; // room for future tool options
}

export type ProgressStage = 'queued' | 'decoding' | 'encoding' | 'done' | 'error';

export interface ProgressEvent {
  inputId: string;
  stage: ProgressStage;
  message?: string;
}

/** Universal interface for ANY tool: 1→1, N→1, 1→N all fit this shape. */
export interface Tool {
  id: string; // 'heic-convert'
  title: string; // 'HEIC → JPG / PNG / WebP'
  category: string; // 'image-convert' | 'pdf' | ...
  /** Distinguishes tools that share input+output formats (PDF rotate vs split).
   *  Undefined for tools that are the sole handler of their format pair. */
  operation?: string;
  /** N→1: `run` is given ALL matching inputs at once and returns a single file
   *  (PDF merge, images→PDF). The controller groups inputs instead of looping. */
  aggregate?: boolean;
  inputFormats: FormatId[];
  outputFormats: FormatId[];
  accepts(input: InputFile): boolean;
  run(
    inputs: InputFile[],
    options: ToolOptions,
    onProgress?: (e: ProgressEvent) => void,
  ): Promise<OutputFile[]>;
}
