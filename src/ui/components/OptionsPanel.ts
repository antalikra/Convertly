import { ROTATE_ANGLES, PDF_SCALES, RESIZE_MAX, type Category, type FormatId } from '@core/types';

const LABEL: Record<string, string> = {
  jpeg: 'JPG',
  png: 'PNG',
  webp: 'WebP',
  avif: 'AVIF',
  tiff: 'TIFF',
  bmp: 'BMP',
  wav: 'WAV',
  mp3: 'MP3',
  pdf: 'PDF',
};

const CAT_LABEL: Record<Category, string> = {
  image: 'Image format',
  audio: 'Audio format',
  document: 'PDF', // document rows aren't rendered as a format seg (PDF uses the rotate control)
};

export interface FormatRow {
  category: Category;
  available: FormatId[];
  selected: FormatId;
}

export interface OptionsView {
  rows: FormatRow[];
  quality: number;
  showQuality: boolean;
  resize: number;
  showResize: boolean;
  resizeMode: string; // 'percent' | 'maxside'
  resizeMaxPx: number;
  /** Global PDF operation preset (applies to all PDFs without a per-file override). */
  showPdfOps: boolean;
  pdfOperation: string;
  /** Disable global Merge when there's nothing to merge (< 2 PDFs). */
  mergeDisabled: boolean;
  /** Global DOCX operation preset. */
  showDocxOps: boolean;
  docxOperation: string;
  /** Rotation-angle seg — shown when a document is set to Rotate. */
  showRotate: boolean;
  rotateAngle: number;
  /** Combine presets (All in one / Each separate) — shown for aggregate targets. */
  showCombine: boolean;
  /** images → PDF page controls — shown when the image target is PDF. */
  showImagesToPdf: boolean;
  pdfPageSize: string; // 'fit' | 'a4' | 'letter'
  pdfOrientation: string; // 'auto' | 'portrait' | 'landscape'
  pdfMargin: number;
  /** Render-scale seg — shown when a document is set to To JPG / To PNG. */
  showScale: boolean;
  pdfScale: number;
  /** DOCX → PDF mode seg (Beta) — shown when a DOCX is set to To PDF. */
  showDocxMode: boolean;
  docxMode: string; // 'raster' | 'reflow'
  /** "Text only" Beta hint — shown when a PDF is set to To DOCX. */
  showDocxHint: boolean;
  /** Page-range input — shown when a PDF is set to Pages. */
  showPages: boolean;
  pageRange: string;
}

export interface OptionsHandlers {
  onFormat(category: Category, format: FormatId): void;
  onQuality(quality: number): void;
  onResize(resize: number): void;
  onResizeMode(mode: string): void;
  onResizeMax(px: number): void;
  /** Global PDF / DOCX operation presets (apply to all files of that kind). */
  onOperation(operation: string): void;
  onDocxOperation(operation: string): void;
  onRotate(angle: number): void;
  onCombine(mode: 'one' | 'separate'): void;
  onPdfPageSize(size: string): void;
  onPdfOrientation(orientation: string): void;
  onPdfMargin(margin: number): void;
  onScale(scale: number): void;
  onPageRange(spec: string): void;
  onDocxMode(mode: 'raster' | 'reflow'): void;
}

export interface OptionsPanelHandle {
  el: HTMLElement;
  update(view: OptionsView): void;
}

export function createOptionsPanel(h: OptionsHandlers): OptionsPanelHandle {
  const el = document.createElement('section');
  el.className = 'group';
  el.innerHTML = `
    <h2>Output</h2>
    <div data-formats></div>
    <div class="group__row" data-quality-row>
      <span class="group__label">Quality</span>
      <input id="quality" type="range" min="0.1" max="1" step="0.05" aria-label="Quality" />
      <span class="quality-val" data-quality-val></span>
    </div>
    <div class="group__row" data-resizemode-row>
      <span class="group__label">Resize</span>
      <div class="seg" data-resizemode-seg role="radiogroup" aria-label="Resize mode">
        <span class="seg__pill no-anim"></span>
        <button type="button" class="seg__btn" role="radio" data-resizemode="percent">Percent</button>
        <button type="button" class="seg__btn" role="radio" data-resizemode="maxside">Max side</button>
      </div>
    </div>
    <div class="group__row" data-resize-row>
      <span class="group__label"></span>
      <input id="resize" type="range" min="0.25" max="1" step="0.05" aria-label="Resize" />
      <span class="quality-val" data-resize-val></span>
    </div>
    <div class="group__row" data-resizemax-row>
      <span class="group__label">Max px</span>
      <div class="seg" data-resizemax-seg role="radiogroup" aria-label="Max longest side (px)">
        <span class="seg__pill no-anim"></span>
        ${RESIZE_MAX.map(
          (px) =>
            `<button type="button" class="seg__btn" role="radio" data-resizemax="${px}">${px}</button>`,
        ).join('')}
      </div>
    </div>
    <div class="group__row" data-pdfop-row>
      <span class="group__label">PDF</span>
      <div class="seg" data-pdfop-seg role="radiogroup" aria-label="PDF operation (all files)">
        <span class="seg__pill no-anim"></span>
        <button type="button" class="seg__btn" role="radio" data-op="rotate">Rotate</button>
        <button type="button" class="seg__btn" role="radio" data-op="split">Split</button>
        <button type="button" class="seg__btn" role="radio" data-op="merge">Merge</button>
        <button type="button" class="seg__btn" role="radio" data-op="tojpg">JPG</button>
        <button type="button" class="seg__btn" role="radio" data-op="topng">PNG</button>
        <button type="button" class="seg__btn" role="radio" data-op="totext">Text</button>
        <button type="button" class="seg__btn" role="radio" data-op="todocx">DOCX</button>
        <button type="button" class="seg__btn" role="radio" data-op="compress">Compress</button>
      </div>
    </div>
    <div class="group__row" data-pagerange-row style="display:none">
      <span class="group__label">Pages</span>
      <input type="text" class="opt-input" data-pagerange placeholder="e.g. 1-3, 5, 8-10" aria-label="Pages to keep" />
    </div>
    <div class="group__row" data-pdfop-hint-row style="display:none">
      <span class="group__label">To DOCX <span class="badge badge--accent badge--beta">Beta</span></span>
      <span class="group__hint">Text only — tables, images and layout aren't kept.</span>
    </div>
    <div class="group__row" data-rotate-row>
      <span class="group__label">Rotation</span>
      <div class="seg" data-rotate-seg role="radiogroup" aria-label="PDF rotation">
        <span class="seg__pill no-anim"></span>
        ${ROTATE_ANGLES.map(
          (a) =>
            `<button type="button" class="seg__btn" role="radio" data-angle="${a}">${a}°</button>`,
        ).join('')}
      </div>
    </div>
    <div class="group__row" data-combine-row>
      <span class="group__label">Combine</span>
      <div class="combine">
        <button type="button" class="btn btn--sm" data-combine="one">All in one</button>
        <button type="button" class="btn btn--sm" data-combine="separate">Each separate</button>
      </div>
    </div>
    <div class="group__row" data-pdfpage-row>
      <span class="group__label">Page</span>
      <div class="seg" data-pdfpage-seg role="radiogroup" aria-label="PDF page size">
        <span class="seg__pill no-anim"></span>
        <button type="button" class="seg__btn" role="radio" data-pdfpage="fit">Fit</button>
        <button type="button" class="seg__btn" role="radio" data-pdfpage="a4">A4</button>
        <button type="button" class="seg__btn" role="radio" data-pdfpage="letter">Letter</button>
      </div>
    </div>
    <div class="group__row" data-pdforient-row>
      <span class="group__label">Orientation</span>
      <div class="seg" data-pdforient-seg role="radiogroup" aria-label="PDF orientation">
        <span class="seg__pill no-anim"></span>
        <button type="button" class="seg__btn" role="radio" data-pdforient="auto">Auto</button>
        <button type="button" class="seg__btn" role="radio" data-pdforient="portrait">Portrait</button>
        <button type="button" class="seg__btn" role="radio" data-pdforient="landscape">Landscape</button>
      </div>
    </div>
    <div class="group__row" data-pdfmargin-row>
      <span class="group__label">Margin</span>
      <div class="seg" data-pdfmargin-seg role="radiogroup" aria-label="PDF margin">
        <span class="seg__pill no-anim"></span>
        <button type="button" class="seg__btn" role="radio" data-pdfmargin="0">None</button>
        <button type="button" class="seg__btn" role="radio" data-pdfmargin="24">Small</button>
        <button type="button" class="seg__btn" role="radio" data-pdfmargin="48">Large</button>
      </div>
    </div>
    <div class="group__row" data-scale-row>
      <span class="group__label">Resolution</span>
      <div class="seg" data-scale-seg role="radiogroup" aria-label="PDF render scale">
        <span class="seg__pill no-anim"></span>
        ${PDF_SCALES.map(
          (s) =>
            `<button type="button" class="seg__btn" role="radio" data-scale="${s}">${s}×</button>`,
        ).join('')}
      </div>
    </div>
    <div class="group__row" data-docxop-row>
      <span class="group__label">DOCX</span>
      <div class="seg" data-docxop-seg role="radiogroup" aria-label="DOCX operation (all files)">
        <span class="seg__pill no-anim"></span>
        <button type="button" class="seg__btn" role="radio" data-docxop="topdf">PDF</button>
        <button type="button" class="seg__btn" role="radio" data-docxop="totext">Text</button>
        <button type="button" class="seg__btn" role="radio" data-docxop="tohtml">HTML</button>
      </div>
    </div>
    <div class="group__row" data-docx-row>
      <span class="group__label">DOCX → PDF <span class="badge badge--accent badge--beta">Beta</span></span>
      <div class="seg" data-docx-seg role="radiogroup" aria-label="DOCX to PDF mode">
        <span class="seg__pill no-anim"></span>
        <button type="button" class="seg__btn" role="radio" data-docx="raster">Visual</button>
        <button type="button" class="seg__btn" role="radio" data-docx="reflow">Text</button>
      </div>
    </div>
  `;

  const formats = el.querySelector<HTMLElement>('[data-formats]')!;
  const quality = el.querySelector<HTMLInputElement>('#quality')!;
  const qualityVal = el.querySelector<HTMLSpanElement>('[data-quality-val]')!;
  const qualityRow = el.querySelector<HTMLElement>('[data-quality-row]')!;
  const resize = el.querySelector<HTMLInputElement>('#resize')!;
  const resizeVal = el.querySelector<HTMLSpanElement>('[data-resize-val]')!;
  const resizeRow = el.querySelector<HTMLElement>('[data-resize-row]')!;
  const resizemodeRow = el.querySelector<HTMLElement>('[data-resizemode-row]')!;
  const resizemodeSeg = el.querySelector<HTMLElement>('[data-resizemode-seg]')!;
  const resizemaxRow = el.querySelector<HTMLElement>('[data-resizemax-row]')!;
  const resizemaxSeg = el.querySelector<HTMLElement>('[data-resizemax-seg]')!;
  const rotateRow = el.querySelector<HTMLElement>('[data-rotate-row]')!;
  const rotateSeg = el.querySelector<HTMLElement>('[data-rotate-seg]')!;
  const pdfopRow = el.querySelector<HTMLElement>('[data-pdfop-row]')!;
  const pdfopSeg = el.querySelector<HTMLElement>('[data-pdfop-seg]')!;
  const pagerangeRow = el.querySelector<HTMLElement>('[data-pagerange-row]')!;
  const pagerangeInput = el.querySelector<HTMLInputElement>('[data-pagerange]')!;
  const pdfopHintRow = el.querySelector<HTMLElement>('[data-pdfop-hint-row]')!;
  const combineRow = el.querySelector<HTMLElement>('[data-combine-row]')!;
  const pdfpageRow = el.querySelector<HTMLElement>('[data-pdfpage-row]')!;
  const pdfpageSeg = el.querySelector<HTMLElement>('[data-pdfpage-seg]')!;
  const pdforientRow = el.querySelector<HTMLElement>('[data-pdforient-row]')!;
  const pdforientSeg = el.querySelector<HTMLElement>('[data-pdforient-seg]')!;
  const pdfmarginRow = el.querySelector<HTMLElement>('[data-pdfmargin-row]')!;
  const pdfmarginSeg = el.querySelector<HTMLElement>('[data-pdfmargin-seg]')!;
  const scaleRow = el.querySelector<HTMLElement>('[data-scale-row]')!;
  const scaleSeg = el.querySelector<HTMLElement>('[data-scale-seg]')!;
  const docxopRow = el.querySelector<HTMLElement>('[data-docxop-row]')!;
  const docxopSeg = el.querySelector<HTMLElement>('[data-docxop-seg]')!;
  const docxRow = el.querySelector<HTMLElement>('[data-docx-row]')!;
  const docxSeg = el.querySelector<HTMLElement>('[data-docx-seg]')!;

  quality.addEventListener('input', () => h.onQuality(Number(quality.value)));
  resize.addEventListener('input', () => h.onResize(Number(resize.value)));
  pagerangeInput.addEventListener('input', () => h.onPageRange(pagerangeInput.value));
  for (const b of Array.from(resizemodeSeg.querySelectorAll<HTMLButtonElement>('.seg__btn'))) {
    b.addEventListener('click', () => h.onResizeMode(String(b.dataset.resizemode)));
  }
  for (const b of Array.from(resizemaxSeg.querySelectorAll<HTMLButtonElement>('.seg__btn'))) {
    b.addEventListener('click', () => h.onResizeMax(Number(b.dataset.resizemax)));
  }
  for (const b of Array.from(rotateSeg.querySelectorAll<HTMLButtonElement>('.seg__btn'))) {
    b.addEventListener('click', () => h.onRotate(Number(b.dataset.angle)));
  }
  for (const b of Array.from(pdfopSeg.querySelectorAll<HTMLButtonElement>('.seg__btn'))) {
    b.addEventListener('click', () => {
      if (b.getAttribute('aria-disabled') === 'true') return; // gated (e.g. Merge < 2)
      h.onOperation(String(b.dataset.op));
    });
  }
  for (const b of Array.from(docxopSeg.querySelectorAll<HTMLButtonElement>('.seg__btn'))) {
    b.addEventListener('click', () => h.onDocxOperation(String(b.dataset.docxop)));
  }
  for (const b of Array.from(combineRow.querySelectorAll<HTMLButtonElement>('[data-combine]'))) {
    b.addEventListener('click', () => h.onCombine(b.dataset.combine as 'one' | 'separate'));
  }
  for (const b of Array.from(pdfpageSeg.querySelectorAll<HTMLButtonElement>('.seg__btn'))) {
    b.addEventListener('click', () => h.onPdfPageSize(String(b.dataset.pdfpage)));
  }
  for (const b of Array.from(pdforientSeg.querySelectorAll<HTMLButtonElement>('.seg__btn'))) {
    b.addEventListener('click', () => h.onPdfOrientation(String(b.dataset.pdforient)));
  }
  for (const b of Array.from(pdfmarginSeg.querySelectorAll<HTMLButtonElement>('.seg__btn'))) {
    b.addEventListener('click', () => h.onPdfMargin(Number(b.dataset.pdfmargin)));
  }
  for (const b of Array.from(scaleSeg.querySelectorAll<HTMLButtonElement>('.seg__btn'))) {
    b.addEventListener('click', () => h.onScale(Number(b.dataset.scale)));
  }
  for (const b of Array.from(docxSeg.querySelectorAll<HTMLButtonElement>('.seg__btn'))) {
    b.addEventListener('click', () => h.onDocxMode(b.dataset.docx as 'raster' | 'reflow'));
  }

  let renderedSig = '';

  function update(v: OptionsView): void {
    // Panel is also relevant for documents when their operation has a sub-control
    // (rotation angle, render scale, combine, DOCX→PDF mode, the To DOCX hint).
    if (
      v.rows.length === 0 &&
      !v.showPdfOps &&
      !v.showDocxOps &&
      !v.showRotate &&
      !v.showScale &&
      !v.showCombine &&
      !v.showDocxMode &&
      !v.showDocxHint &&
      !v.showPages
    ) {
      el.hidden = true;
      return;
    }
    el.hidden = false;

    // Rebuild the per-category format rows only when the format sets change.
    const sig = v.rows.map((r) => `${r.category}:${r.available.join('|')}`).join(';');
    if (sig !== renderedSig) {
      renderedSig = sig;
      formats.replaceChildren(...v.rows.map((r) => formatRow(r, h)));
    }

    // Update active highlight + slide the indicator pill every render.
    for (const r of v.rows) {
      const seg = formats.querySelector<HTMLElement>(`[data-seg="${r.category}"]`);
      if (!seg) continue;
      for (const b of Array.from(seg.querySelectorAll<HTMLButtonElement>('.seg__btn'))) {
        const active = b.dataset.fmt === r.selected;
        b.classList.toggle('seg__btn--active', active);
        b.setAttribute('aria-checked', String(active));
      }
      syncPill(seg);
    }

    qualityRow.style.display = v.showQuality ? '' : 'none';
    quality.value = String(v.quality);
    qualityVal.textContent = `${Math.round(v.quality * 100)}%`;

    // Resize: a mode seg, then either the percent slider or the max-px presets.
    resizemodeRow.style.display = v.showResize ? '' : 'none';
    if (v.showResize) {
      for (const b of Array.from(resizemodeSeg.querySelectorAll<HTMLButtonElement>('.seg__btn'))) {
        const active = b.dataset.resizemode === v.resizeMode;
        b.classList.toggle('seg__btn--active', active);
        b.setAttribute('aria-checked', String(active));
      }
      syncPill(resizemodeSeg);
    }
    const showPercent = v.showResize && v.resizeMode !== 'maxside';
    resizeRow.style.display = showPercent ? '' : 'none';
    resize.value = String(v.resize);
    resizeVal.textContent = v.resize >= 1 ? 'Original' : `${Math.round(v.resize * 100)}%`;
    const showMax = v.showResize && v.resizeMode === 'maxside';
    resizemaxRow.style.display = showMax ? '' : 'none';
    if (showMax) {
      for (const b of Array.from(resizemaxSeg.querySelectorAll<HTMLButtonElement>('.seg__btn'))) {
        const active = Number(b.dataset.resizemax) === v.resizeMaxPx;
        b.classList.toggle('seg__btn--active', active);
        b.setAttribute('aria-checked', String(active));
      }
      syncPill(resizemaxSeg);
    }

    // Global PDF operation preset (applies to every PDF without a per-file override).
    pdfopRow.style.display = v.showPdfOps ? '' : 'none';
    if (v.showPdfOps) {
      for (const b of Array.from(pdfopSeg.querySelectorAll<HTMLButtonElement>('.seg__btn'))) {
        const active = b.dataset.op === v.pdfOperation;
        b.classList.toggle('seg__btn--active', active);
        b.setAttribute('aria-checked', String(active));
        // Merge needs ≥2 PDFs: keep it enabled (so the hover tooltip shows) but gate it.
        if (b.dataset.op === 'merge') {
          b.classList.toggle('seg__btn--disabled', v.mergeDisabled);
          b.setAttribute('aria-disabled', String(v.mergeDisabled));
          if (v.mergeDisabled) b.dataset.tip = 'Add at least one more PDF';
          else delete b.dataset.tip;
        }
      }
      syncPill(pdfopSeg);
    }

    // Global DOCX operation preset.
    docxopRow.style.display = v.showDocxOps ? '' : 'none';
    if (v.showDocxOps) {
      for (const b of Array.from(docxopSeg.querySelectorAll<HTMLButtonElement>('.seg__btn'))) {
        const active = b.dataset.docxop === v.docxOperation;
        b.classList.toggle('seg__btn--active', active);
        b.setAttribute('aria-checked', String(active));
      }
      syncPill(docxopSeg);
    }

    combineRow.style.display = v.showCombine ? '' : 'none';

    // images → PDF: page size, then (for a fixed page) orientation + margin.
    pdfpageRow.style.display = v.showImagesToPdf ? '' : 'none';
    if (v.showImagesToPdf) {
      for (const b of Array.from(pdfpageSeg.querySelectorAll<HTMLButtonElement>('.seg__btn'))) {
        const active = b.dataset.pdfpage === v.pdfPageSize;
        b.classList.toggle('seg__btn--active', active);
        b.setAttribute('aria-checked', String(active));
      }
      syncPill(pdfpageSeg);
    }
    const fixedPage = v.showImagesToPdf && v.pdfPageSize !== 'fit';
    pdforientRow.style.display = fixedPage ? '' : 'none';
    pdfmarginRow.style.display = fixedPage ? '' : 'none';
    if (fixedPage) {
      for (const b of Array.from(pdforientSeg.querySelectorAll<HTMLButtonElement>('.seg__btn'))) {
        const active = b.dataset.pdforient === v.pdfOrientation;
        b.classList.toggle('seg__btn--active', active);
        b.setAttribute('aria-checked', String(active));
      }
      syncPill(pdforientSeg);
      for (const b of Array.from(pdfmarginSeg.querySelectorAll<HTMLButtonElement>('.seg__btn'))) {
        const active = Number(b.dataset.pdfmargin) === v.pdfMargin;
        b.classList.toggle('seg__btn--active', active);
        b.setAttribute('aria-checked', String(active));
      }
      syncPill(pdfmarginSeg);
    }

    // PDF → image render scale.
    scaleRow.style.display = v.showScale ? '' : 'none';
    if (v.showScale) {
      for (const b of Array.from(scaleSeg.querySelectorAll<HTMLButtonElement>('.seg__btn'))) {
        const active = Number(b.dataset.scale) === v.pdfScale;
        b.classList.toggle('seg__btn--active', active);
        b.setAttribute('aria-checked', String(active));
      }
      syncPill(scaleSeg);
    }

    // DOCX → PDF mode (Beta) — only relevant when the DOCX target is PDF.
    docxRow.style.display = v.showDocxMode ? '' : 'none';
    if (v.showDocxMode) {
      for (const b of Array.from(docxSeg.querySelectorAll<HTMLButtonElement>('.seg__btn'))) {
        const active = b.dataset.docx === v.docxMode;
        b.classList.toggle('seg__btn--active', active);
        b.setAttribute('aria-checked', String(active));
      }
      syncPill(docxSeg);
    }

    // PDF Pages: which pages to keep/reorder. Don't clobber the field while typing.
    pagerangeRow.style.display = v.showPages ? '' : 'none';
    if (v.showPages && document.activeElement !== pagerangeInput) {
      pagerangeInput.value = v.pageRange;
    }

    // PDF → DOCX is a best-effort text extraction; flag it (Beta) when chosen.
    pdfopHintRow.style.display = v.showDocxHint ? '' : 'none';

    // Angle sub-control: only meaningful for the rotate operation.
    rotateRow.style.display = v.showRotate ? '' : 'none';
    if (v.showRotate) {
      for (const b of Array.from(rotateSeg.querySelectorAll<HTMLButtonElement>('.seg__btn'))) {
        const active = Number(b.dataset.angle) === v.rotateAngle;
        b.classList.toggle('seg__btn--active', active);
        b.setAttribute('aria-checked', String(active));
      }
      syncPill(rotateSeg);
    }
  }

  return { el, update };
}

function formatRow(row: FormatRow, h: OptionsHandlers): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'group__row';

  const label = document.createElement('span');
  label.className = 'group__label';
  label.textContent = CAT_LABEL[row.category];

  const seg = document.createElement('div');
  seg.className = 'seg';
  seg.dataset.seg = row.category;
  seg.setAttribute('role', 'radiogroup');

  // The sliding indicator sits behind the buttons; `no-anim` is removed after
  // the first positioning so the initial placement doesn't slide in from 0.
  const pill = document.createElement('span');
  pill.className = 'seg__pill no-anim';

  seg.append(
    pill,
    ...row.available.map((f) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'seg__btn';
      b.dataset.fmt = f;
      b.setAttribute('role', 'radio');
      b.textContent = LABEL[f] ?? f.toUpperCase();
      b.addEventListener('click', () => h.onFormat(row.category, f));
      return b;
    }),
  );

  wrap.append(label, seg);
  return wrap;
}

/** Move the indicator pill to cover the active button (animated via CSS). */
function syncPill(seg: HTMLElement): void {
  const active = seg.querySelector<HTMLButtonElement>('.seg__btn--active');
  const pill = seg.querySelector<HTMLElement>('.seg__pill');
  if (!active || !pill) return;
  pill.style.left = `${active.offsetLeft}px`;
  pill.style.top = `${active.offsetTop}px`;
  pill.style.width = `${active.offsetWidth}px`;
  pill.style.height = `${active.offsetHeight}px`;
  if (pill.classList.contains('no-anim')) {
    requestAnimationFrame(() => pill.classList.remove('no-anim'));
  }
}
