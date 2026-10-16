import { en } from './en';
import type { SiteCopy } from './types';

// One entry per site language. The first is the default and lives at the site
// root; the others live under /<lang>/ (e.g. /de/heic-to-jpg/). To add a
// language, copy en.ts, translate it and list it here.
export const LOCALES: SiteCopy[] = [en];

export const DEFAULT_LOCALE = LOCALES[0];
