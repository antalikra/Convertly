import type { Tool, OutputFile } from '../../types';

/**
 * DOCX → plain text (1→1). mammoth's `extractRawText` flattens the document to
 * text (no styling, tables become their cell text in order). Lazy-imported.
 */
export const docxToTextTool: Tool = {
  id: 'docx-to-text',
  title: 'DOCX → Text',
  category: 'pdf',
  inputFormats: ['docx'],
  outputFormats: ['txt'],
  accepts: (i) => i.detectedFormat === 'docx',

  async run(inputs, _options, onProgress) {
    const results: OutputFile[] = [];
    const { default: mammoth } = await import('mammoth/mammoth.browser.js');

    for (const input of inputs) {
      try {
        onProgress?.({ inputId: input.id, stage: 'decoding' });
        const { value } = await mammoth.extractRawText({ arrayBuffer: await input.file.arrayBuffer() });

        onProgress?.({ inputId: input.id, stage: 'encoding' });
        results.push({
          blob: new Blob([value], { type: 'text/plain' }),
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
