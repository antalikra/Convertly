import { zipSync, type Zippable } from 'fflate';
import type { OutputFile } from '@core/types';

/** Download a single Blob via an <a download> link — no `downloads` permission. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke after the click has had a chance to start.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Bundle outputs into a single ZIP and download it (batch case). */
export async function downloadZip(
  outputs: OutputFile[],
  zipName = 'convertly.zip',
): Promise<void> {
  const entries: Zippable = {};
  const used = new Set<string>();

  for (const out of outputs) {
    const name = uniqueName(out.fileName, used);
    const buf = new Uint8Array(await out.blob.arrayBuffer());
    entries[name] = buf;
  }

  // Images are already compressed; level 0 (store) keeps zipping fast.
  const zipped = zipSync(entries, { level: 0 });
  // Copy into a fresh ArrayBuffer-backed view so Blob gets a clean BlobPart.
  const blob = new Blob([zipped.slice()], { type: 'application/zip' });
  downloadBlob(blob, zipName);
}

function uniqueName(name: string, used: Set<string>): string {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  const dot = name.lastIndexOf('.');
  const base = dot === -1 ? name : name.slice(0, dot);
  const ext = dot === -1 ? '' : name.slice(dot);
  let i = 1;
  let candidate: string;
  do {
    candidate = `${base} (${i})${ext}`;
    i += 1;
  } while (used.has(candidate));
  used.add(candidate);
  return candidate;
}
