// The landing pages: one per task people search for, each opening the converter
// preset for that task. Words live in site/content/<locale>.ts.
import type { Settings } from '../src/infra/settings';
import type { Tab } from '../src/ui/mountApp';

export interface Preset {
  tab: Tab;
  settings: Partial<Settings>;
}

export const PAGES = {
  'heic-to-jpg': { tab: 'media', settings: { imageFormat: 'jpeg' } },
  'heic-to-png': { tab: 'media', settings: { imageFormat: 'png' } },
  'heic-to-pdf': { tab: 'media', settings: { imageFormat: 'pdf' } },
  'webp-to-jpg': { tab: 'media', settings: { imageFormat: 'jpeg' } },
  'merge-pdf': { tab: 'pdf', settings: { pdfOperation: 'merge' } },
  'wav-to-mp3': { tab: 'media', settings: { audioFormat: 'mp3' } },
} satisfies Record<string, Preset>;

export type Slug = keyof typeof PAGES;
export const SLUGS = Object.keys(PAGES) as Slug[];

/** The main page; the site root shows it too (its canonical URL stays /heic-to-jpg/). */
export const HOME: Slug = 'heic-to-jpg';
