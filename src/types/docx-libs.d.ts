// Ambient declarations for the DOCX→PDF libs that ship without (usable) types
// in our setup. Kept loose on purpose — these are best-effort Beta pipelines.

declare module 'mammoth/mammoth.browser.js' {
  // mammoth's self-contained browser bundle (UMD). We use convertToHtml (→ HTML /
  // DOCX→PDF) and extractRawText (→ plain text).
  const mammoth: {
    convertToHtml(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string; messages: unknown[] }>;
    extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string; messages: unknown[] }>;
  };
  export default mammoth;
}

declare module 'html2canvas' {
  const html2canvas: (
    element: HTMLElement,
    options?: Record<string, unknown>,
  ) => Promise<HTMLCanvasElement>;
  export default html2canvas;
}

declare module '@pdf-lib/fontkit' {
  const fontkit: unknown;
  export default fontkit;
}
