import type { Tool, OutputFile } from '../../types';
import { extractPdfText } from '@infra/pdfRender';
import { buildDocx } from '@infra/docxWrite';

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * Extract a PDF's text into an editable .docx (1→1, Beta). Reuses pdf.js text
 * extraction (lazy, self-hosted worker — see infra/pdfRender), then wraps each
 * line in a Word paragraph via the fflate-zipped OOXML writer (no new dep).
 * Text only: layout, columns, tables and images are NOT reconstructed.
 */
export const pdfToDocxTool: Tool = {
  id: 'pdf-to-docx',
  title: 'PDF → DOCX (text, Beta)',
  category: 'pdf',
  inputFormats: ['pdf'],
  outputFormats: ['docx'],
  accepts: (i) => i.detectedFormat === 'pdf',

  async run(inputs, _options, onProgress) {
    const results: OutputFile[] = [];

    for (const input of inputs) {
      try {
        onProgress?.({ inputId: input.id, stage: 'decoding' });
        const text = await extractPdfText(input.file);

        onProgress?.({ inputId: input.id, stage: 'encoding' });
        const bytes = buildDocx(text);
        results.push({
          blob: new Blob([new Uint8Array(bytes)], { type: DOCX_MIME }),
          fileName: `${input.name.replace(/\.[^.]+$/, '')}.docx`,
          format: 'docx',
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
