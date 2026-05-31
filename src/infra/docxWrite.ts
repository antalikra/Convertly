// Minimal text-only DOCX (OOXML) writer. A .docx is just a ZIP of XML parts;
// we emit the few parts Word needs for a plain-text document and zip them with
// fflate (already bundled — no new dependency, pure JS, no eval → CSP-safe).
// Text only: no styles, tables, images or layout. Used by the PDF → DOCX tool.

import { zipSync, strToU8 } from 'fflate';

const CONTENT_TYPES =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
  `<Default Extension="xml" ContentType="application/xml"/>` +
  `<Override PartName="/word/document.xml" ` +
  `ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
  `</Types>`;

const RELS =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" ` +
  `Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" ` +
  `Target="word/document.xml"/></Relationships>`;

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

/** Drop control chars XML 1.0 rejects (keep tab); done per-codepoint so no
 *  literal control characters live in this source file. */
function stripControl(s: string): string {
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0) as number;
    if (c === 9 || c >= 32) out += ch; // tab, or any printable
  }
  return out;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** One <w:p> per line; xml:space="preserve" keeps indentation. Empty lines
 *  become blank paragraphs so paragraph/page spacing survives. */
function paragraph(line: string): string {
  const clean = stripControl(line).trimEnd();
  if (!clean) return '<w:p/>';
  return `<w:p><w:r><w:t xml:space="preserve">${escapeXml(clean)}</w:t></w:r></w:p>`;
}

/** Build a text-only .docx (each input line → one Word paragraph). */
export function buildDocx(text: string): Uint8Array {
  const body = text.split('\n').map(paragraph).join('');
  const document =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="${W_NS}"><w:body>${body}<w:sectPr/></w:body></w:document>`;

  return zipSync({
    '[Content_Types].xml': strToU8(CONTENT_TYPES),
    '_rels/.rels': strToU8(RELS),
    'word/document.xml': strToU8(document),
  });
}
