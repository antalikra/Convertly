import type { FormatId } from '@core/types';

export type ThemeMode = 'dark' | 'light';

/** Operation chosen for PDF inputs (the document card's picker). */
export type PdfOperation = 'rotate' | 'split' | 'merge' | 'tojpg' | 'topng' | 'totext';

export interface Settings {
  /** Target format for image inputs. */
  imageFormat: FormatId;
  /** Target format for audio inputs. */
  audioFormat: FormatId;
  quality: number; // 0..1
  /** Scale factor for image output (0.25..1); 1 = original size. */
  resize: number;
  /** Operation applied to PDF inputs. */
  pdfOperation: PdfOperation;
  /** Clockwise rotation for the PDF rotate operation (degrees, multiple of 90). */
  pdfRotateAngle: number;
  /** Render scale for PDF → image (1 = 72dpi-ish, 2 ≈ retina). Bigger = sharper + heavier. */
  pdfImageScale: number;
  theme: ThemeMode;
}

export const DEFAULT_SETTINGS: Settings = {
  imageFormat: 'jpeg',
  audioFormat: 'mp3',
  quality: 1, // max quality by default (png = lossless)
  resize: 1,
  pdfOperation: 'rotate',
  pdfRotateAngle: 90,
  pdfImageScale: 2,
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
