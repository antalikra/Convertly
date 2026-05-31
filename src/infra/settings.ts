import type { FormatId } from '@core/types';

export type ThemeMode = 'dark' | 'light';

/** Image resize mode. percent = scale by the slider; maxside = cap longest side. */
export type ResizeMode = 'percent' | 'maxside';

/** images → PDF page sizing. fit = page equals each image; else fixed A4/Letter. */
export type PdfPageSize = 'fit' | 'a4' | 'letter';
export type PdfOrientation = 'auto' | 'portrait' | 'landscape';

/** Operation chosen for PDF inputs (the document card's picker). */
export type PdfOperation =
  | 'rotate'
  | 'split'
  | 'merge'
  | 'tojpg'
  | 'topng'
  | 'totext'
  | 'todocx';

/** Operation chosen for DOCX inputs (the document card's DOCX picker). */
export type DocxOperation = 'topdf' | 'totext' | 'tohtml';

/** DOCX → PDF rendering mode (Beta). raster = visual fidelity; reflow = selectable text. */
export type DocxMode = 'raster' | 'reflow';

export interface Settings {
  /** Target format for image inputs. */
  imageFormat: FormatId;
  /** Target format for audio inputs. */
  audioFormat: FormatId;
  quality: number; // 0..1
  /** Scale factor for image output (0.25..1); 1 = original size (percent mode). */
  resize: number;
  /** Resize mode: scale by percent, or cap the longest side to a px preset. */
  resizeMode: ResizeMode;
  /** Longest-side cap (px) used in 'maxside' mode. */
  resizeMaxPx: number;
  /** images → PDF: page size, orientation, and margin (pt). */
  pdfPageSize: PdfPageSize;
  pdfOrientation: PdfOrientation;
  pdfMargin: number;
  /** Operation applied to PDF inputs. */
  pdfOperation: PdfOperation;
  /** Clockwise rotation for the PDF rotate operation (degrees, multiple of 90). */
  pdfRotateAngle: number;
  /** Render scale for PDF → image (1 = 72dpi-ish, 2 ≈ retina). Bigger = sharper + heavier. */
  pdfImageScale: number;
  /** Operation applied to DOCX inputs (→ PDF / text / HTML). */
  docxOperation: DocxOperation;
  /** DOCX → PDF mode (Beta). */
  docxMode: DocxMode;
  theme: ThemeMode;
}

export const DEFAULT_SETTINGS: Settings = {
  imageFormat: 'jpeg',
  audioFormat: 'mp3',
  quality: 1, // max quality by default (png = lossless)
  resize: 1,
  resizeMode: 'percent',
  resizeMaxPx: 1920,
  pdfPageSize: 'fit',
  pdfOrientation: 'auto',
  pdfMargin: 0,
  pdfOperation: 'rotate',
  pdfRotateAngle: 90,
  pdfImageScale: 2,
  docxOperation: 'topdf',
  docxMode: 'raster',
  theme: 'dark',
};

const KEY = 'convertly.settings';

/** Thin wrapper over chrome.storage.local. Falls back to defaults outside the
 *  extension context (e.g. vitest) so callers never have to guard. */
export async function loadSettings(): Promise<Settings> {
  if (!globalThis.chrome?.storage?.local) return { ...DEFAULT_SETTINGS };
  const got = await chrome.storage.local.get(KEY);
  return { ...DEFAULT_SETTINGS, ...(got[KEY] as Partial<Settings> | undefined) };
}

export async function saveSettings(settings: Settings): Promise<void> {
  if (!globalThis.chrome?.storage?.local) return;
  await chrome.storage.local.set({ [KEY]: settings });
}
