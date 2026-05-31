import type { Tool, OutputFile } from '../../types';

// The bundled Cyrillic-capable font (same asset the DOCX reflow path uses).
async function loadRoboto(): Promise<Uint8Array> {
  const url = (await import('@expo-google-fonts/roboto/400Regular/Roboto_400Regular.ttf?url'))
    .default;
  const res = await fetch(url);
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * Stamp a PDF (operation 'stamp'): a watermark / stamp text (centred diagonal or
 * footer) and/or page numbers, drawn on every page with pdf-lib + a bundled
 * Unicode font (Cyrillic-safe). Keeps the original pages. 1→1.
 */
export const pdfStampTool: Tool = {
  id: 'pdf-stamp',
  title: 'PDF stamp / page numbers',
  category: 'pdf',
  operation: 'stamp',
  inputFormats: ['pdf'],
  outputFormats: ['pdf'],
  accepts: (i) => i.detectedFormat === 'pdf',

  async run(inputs, options, onProgress) {
    const results: OutputFile[] = [];
    const { PDFDocument, rgb, degrees } = await import('pdf-lib');
    const { default: fontkit } = await import('@pdf-lib/fontkit');
    const text = typeof options.stampText === 'string' ? options.stampText.trim() : '';
    const footer = options.stampPosition === 'footer';
    const pageNumbers = options.stampPageNumbers === true;
    const fontBytes = await loadRoboto();

    for (const input of inputs) {
      try {
        onProgress?.({ inputId: input.id, stage: 'decoding' });
        const doc = await PDFDocument.load(await input.file.arrayBuffer());
        doc.registerFontkit(fontkit as Parameters<typeof doc.registerFontkit>[0]);
        const font = await doc.embedFont(fontBytes, { subset: true });

        doc.getPages().forEach((page, i) => {
          const { width, height } = page.getSize();
          if (text && footer) {
            const size = 12;
            const tw = font.widthOfTextAtSize(text, size);
            page.drawText(text, { x: (width - tw) / 2, y: 24, size, font, color: rgb(0.4, 0.4, 0.4) });
          } else if (text) {
            // Centred diagonal watermark.
            const size = Math.max(28, Math.min(width, height) / 6);
            page.drawText(text, {
              x: width * 0.12,
              y: height * 0.32,
              size,
              font,
              color: rgb(0.5, 0.5, 0.5),
              rotate: degrees(45),
              opacity: 0.18,
            });
          }
          if (pageNumbers) {
            const size = 10;
            const label = `${i + 1}`;
            const tw = font.widthOfTextAtSize(label, size);
            page.drawText(label, { x: width - tw - 24, y: 18, size, font, color: rgb(0.3, 0.3, 0.3) });
          }
        });

        onProgress?.({ inputId: input.id, stage: 'encoding' });
        const bytes = await doc.save();
        results.push({
          blob: new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }),
          fileName: `${input.name.replace(/\.[^.]+$/, '')}-stamped.pdf`,
          format: 'pdf',
        });
        onProgress?.({ inputId: input.id, stage: 'done' });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        onProgress?.({ inputId: input.id, stage: 'error', message });
      }
    }

    return results;
  },
};
