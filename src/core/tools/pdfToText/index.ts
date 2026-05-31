import type { Tool, OutputFile } from '../../types';
import { extractPdfText } from '@infra/pdfRender';

/**
 * Extract a PDF's text to a .txt file (1→1). Uses pdf.js getTextContent (lazy,
 * self-hosted worker — see infra/pdfRender). Raw reading-order text only: no
 * layout, columns or tables are reconstructed.
 */
export const pdfToTextTool: Tool = {
  id: 'pdf-to-text',
  title: 'PDF → Text',
  category: 'pdf',
  inputFormats: ['pdf'],
  outputFormats: ['txt'],
  accepts: (i) => i.detectedFormat === 'pdf',

  async run(inputs, _options, onProgress) {
    const results: OutputFile[] = [];

    for (const input of inputs) {
      try {
        onProgress?.({ inputId: input.id, stage: 'decoding' });
        const text = await extractPdfText(input.file);

        onProgress?.({ inputId: input.id, stage: 'encoding' });
        results.push({
          blob: new Blob([text], { type: 'text/plain' }),
          fileName: `${input.name.replace(/\.[^.]+$/, '')}.txt`,
          format: 'txt',
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
