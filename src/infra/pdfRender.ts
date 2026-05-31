// Lazy pdf.js (pdfjs-dist) loader + page rasteriser. pdf.js is the only viable
// client-side PDF *renderer*; it runs its parser in a Web Worker.
//
// MV3 / CSP: the worker is self-hosted (Vite emits it as a packaged asset via
// `?url`; served from the extension origin → allowed by `script-src 'self'`).
// `isEvalSupported: false` keeps the worker off `eval`; `disableFontFace: true`
// renders glyphs with path commands (no injected @font-face) — both CSP-safe.
//
// OPEN RISK (verify in real Chrome MV3): the module worker loads under the strict
// CSP. If it doesn't, pdf.js falls back to a main-thread "fake worker" (slower,
// blocks the UI) but should still produce output.

let libPromise: Promise<typeof import('pdfjs-dist')> | undefined;

async function loadPdfjs(): Promise<typeof import('pdfjs-dist')> {
  if (!libPromise) {
    libPromise = (async () => {
      const lib = await import('pdfjs-dist');
      const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
      lib.GlobalWorkerOptions.workerSrc = workerUrl;
      return lib;
    })();
  }
  return libPromise;
}

/**
 * Render every page of `file` to an OffscreenCanvas and hand it to `onPage`
 * (called in page order). The canvas is reused-per-page then released by the
 * caller's encode step. `scale` controls output resolution (2 ≈ retina).
 */
export async function renderPdfPages(
  file: File,
  scale: number,
  onPage: (pageNum: number, total: number, canvas: OffscreenCanvas) => Promise<void>,
): Promise<void> {
  const lib = await loadPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  // isEvalSupported keeps the worker off eval (CSP); cast past the param type
  // which doesn't advertise it.
  const params = {
    data,
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0, // ERRORS only — silence benign "TT: undefined function" font warnings
  } as unknown as Parameters<typeof lib.getDocument>[0];
  const loadingTask = lib.getDocument(params);
  const doc = await loadingTask.promise;

  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale });
      const canvas = new OffscreenCanvas(
        Math.max(1, Math.ceil(viewport.width)),
        Math.max(1, Math.ceil(viewport.height)),
      );
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not get 2D canvas context');
      // pdf.js types model canvas/context as DOM types; OffscreenCanvas works at
      // runtime, so cast the whole params object past the structural check.
      const renderParams = { canvas, canvasContext: ctx, viewport } as unknown as Parameters<
        typeof page.render
      >[0];
      await page.render(renderParams).promise;
      await onPage(n, doc.numPages, canvas);
      page.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }
}

/**
 * Extract the text of every page (pages separated by a blank line). Returns the
 * raw reading-order text pdf.js exposes — no layout/columns reconstruction.
 */
export async function extractPdfText(file: File): Promise<string> {
  const lib = await loadPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const params = {
    data,
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0,
  } as unknown as Parameters<typeof lib.getDocument>[0];
  const loadingTask = lib.getDocument(params);
  const doc = await loadingTask.promise;

  try {
    const pages: string[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      let line = '';
      for (const item of content.items) {
        if (!('str' in item)) continue; // skip TextMarkedContent markers
        line += item.str;
        if (item.hasEOL) line += '\n';
        else line += ' ';
      }
      pages.push(line.trim());
      page.cleanup();
    }
    return pages.join('\n\n');
  } finally {
    await loadingTask.destroy();
  }
}
