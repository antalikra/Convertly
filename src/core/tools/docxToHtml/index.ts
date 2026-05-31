import type { Tool, OutputFile } from '../../types';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * DOCX → HTML (1→1). mammoth converts the document to a clean HTML body
 * fragment (headings, lists, tables, basic styling); we wrap it in a minimal,
 * standalone, UTF-8 HTML5 document so the file opens correctly on its own.
 * Lazy-imported.
 */
export const docxToHtmlTool: Tool = {
  id: 'docx-to-html',
  title: 'DOCX → HTML',
  category: 'pdf',
  inputFormats: ['docx'],
  outputFormats: ['html'],
  accepts: (i) => i.detectedFormat === 'docx',

  async run(inputs, _options, onProgress) {
    const results: OutputFile[] = [];
    const { default: mammoth } = await import('mammoth/mammoth.browser.js');

    for (const input of inputs) {
      try {
        onProgress?.({ inputId: input.id, stage: 'decoding' });
        const { value } = await mammoth.convertToHtml({ arrayBuffer: await input.file.arrayBuffer() });

        onProgress?.({ inputId: input.id, stage: 'encoding' });
        const title = escapeHtml(input.name.replace(/\.[^.]+$/, ''));
        const html =
          `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n` +
          `<meta name="viewport" content="width=device-width, initial-scale=1">\n` +
          `<title>${title}</title>\n</head>\n<body>\n${value}\n</body>\n</html>\n`;
        results.push({
          blob: new Blob([html], { type: 'text/html' }),
          fileName: `${input.name.replace(/\.[^.]+$/, '')}.html`,
          format: 'html',
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
