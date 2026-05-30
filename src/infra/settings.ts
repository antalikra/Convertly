import type { FormatId } from '@core/types';

export type ThemeMode = 'dark' | 'light';

export interface Settings {
  /** Target format for image inputs. */
  imageFormat: FormatId;
  /** Target format for audio inputs. */
  audioFormat: FormatId;
  quality: number; // 0..1
  /** Scale factor for image output (0.25..1); 1 = original size. */
  resize: number;
  theme: ThemeMode;
}

export const DEFAULT_SETTINGS: Settings = {
  imageFormat: 'jpeg',
  audioFormat: 'mp3',
  quality: 1, // max quality by default (png = lossless)
  resize: 1,
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
