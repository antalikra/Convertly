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
  // audio
  | 'wav'
  | 'mp3'
  | 'flac'
  | 'm4a'
  | 'aac'
  | 'ogg';

export type Category = 'image' | 'audio';

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
];

/** Formats whose quality slider matters. png is here because UPNG uses quality
 *  as a palette-quantisation level (1 = lossless, lower = fewer colours/smaller). */
export const LOSSY_FORMATS: readonly FormatId[] = ['jpeg', 'webp', 'avif', 'png', 'mp3'];

const AUDIO: readonly FormatId[] = ['wav', 'mp3', 'flac', 'm4a', 'aac', 'ogg'];

export function formatCategory(format: FormatId): Category {
  return AUDIO.includes(format) ? 'audio' : 'image';
}

/** Category of an input file, or null if its format is unknown/unsupported. */
export function inputCategory(input: InputFile): Category | null {
  return input.detectedFormat === 'unknown' ? null : formatCategory(input.detectedFormat);
}

export const CATEGORY_ORDER: readonly Category[] = ['image', 'audio'];

export interface InputFile {
  id: string;
  file: File;
  name: string;
  sizeBytes: number;
  detectedFormat: FormatId | 'unknown';
}

export interface OutputFile {
  blob: Blob;
  fileName: string; // "IMG_1234.jpg"
  format: FormatId;
}

export interface ToolOptions {
  outputFormat: FormatId;
  quality?: number; // 0..1 for jpeg/webp
  resize?: number; // 0..1 scale factor for image output; 1 = original
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
  inputFormats: FormatId[];
  outputFormats: FormatId[];
  accepts(input: InputFile): boolean;
  run(
    inputs: InputFile[],
    options: ToolOptions,
    onProgress?: (e: ProgressEvent) => void,
  ): Promise<OutputFile[]>;
}
