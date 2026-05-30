import type { FormatId } from '@core/types';

const EXT: Partial<Record<FormatId, string>> = {
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
};

/** "IMG_1234.heic" + jpeg -> "IMG_1234.jpg". Keeps the original base name. */
export function renameForFormat(originalName: string, format: FormatId): string {
  const ext = EXT[format] ?? format;
  const dot = originalName.lastIndexOf('.');
  const base = dot === -1 ? originalName : originalName.slice(0, dot);
  return `${base}.${ext}`;
}
