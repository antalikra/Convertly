import { ROTATE_ANGLES, PDF_SCALES, type Category, type FormatId } from '@core/types';

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
  /** PDF operation picker (Rotate / Split): shown when a PDF input is present. */
  showPdfOps: boolean;
  pdfOperation: string; // 'rotate' | 'split' | 'merge'
  /** Disable Merge when there's nothing to merge (< 2 PDFs). */
  mergeDisabled: boolean;
  rotateAngle: number; // angle sub-control shown only when operation is 'rotate'
  /** Combine presets (All in one / Each separate) — shown for aggregate targets. */
  showCombine: boolean;
  /** Render-scale seg — shown for PDF → image operations. */
  showScale: boolean;
  pdfScale: number;
  /** DOCX → PDF mode seg (Beta) — shown when a DOCX input is present. */
  showDocx: boolean;
  docxMode: string; // 'raster' | 'reflow'
}

export interface OptionsHandlers {
  onFormat(category: Category, format: FormatId): void;
  onQuality(quality: number): void;
  onResize(resize: number): void;
  onOperation(operation: string): void;
  onRotate(angle: number): void;
  onCombine(mode: 'one' | 'separate'): void;
  onScale(scale: number): void;
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
    <div class="group__row" data-resize-row>
      <span class="group__label">Resize</span>
      <input id="resize" type="range" min="0.25" max="1" step="0.05" aria-label="Resize" />
      <span class="quality-val" data-resize-val></span>
    </div>
    <div class="group__row" data-pdfop-row>
      <span class="group__label">PDF</span>
      <div class="seg" data-pdfop-seg role="radiogroup" aria-label="PDF operation">
        <span class="seg__pill no-anim"></span>
        <button type="button" class="seg__btn" role="radio" data-op="rotate">Rotate</button>
        <button type="button" class="seg__btn" role="radio" data-op="split">Split pages</button>
        <button type="button" class="seg__btn" role="radio" data-op="merge">Merge</button>
        <button type="button" class="seg__btn" role="radio" data-op="tojpg">To JPG</button>
        <button type="button" class="seg__btn" role="radio" data-op="topng">To PNG</button>
        <button type="button" class="seg__btn" role="radio" data-op="totext">To text</button>
        <button type="button" class="seg__btn" role="radio" data-op="todocx">To DOCX</button>
      </div>
    </div>
    <div class="group__row" data-pdfop-hint-row hidden>
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
  const rotateRow = el.querySelector<HTMLElement>('[data-rotate-row]')!;
  const rotateSeg = el.querySelector<HTMLElement>('[data-rotate-seg]')!;
  const pdfopRow = el.querySelector<HTMLElement>('[data-pdfop-row]')!;
  const pdfopSeg = el.querySelector<HTMLElement>('[data-pdfop-seg]')!;
  const pdfopHintRow = el.querySelector<HTMLElement>('[data-pdfop-hint-row]')!;
  const combineRow = el.querySelector<HTMLElement>('[data-combine-row]')!;
  const scaleRow = el.querySelector<HTMLElement>('[data-scale-row]')!;
  const scaleSeg = el.querySelector<HTMLElement>('[data-scale-seg]')!;
  const docxRow = el.querySelector<HTMLElement>('[data-docx-row]')!;
  const docxSeg = el.querySelector<HTMLElement>('[data-docx-seg]')!;

  quality.addEventListener('input', () => h.onQuality(Number(quality.value)));
  resize.addEventListener('input', () => h.onResize(Number(resize.value)));
  for (const b of Array.from(rotateSeg.querySelectorAll<HTMLButtonElement>('.seg__btn'))) {
    b.addEventListener('click', () => h.onRotate(Number(b.dataset.angle)));
  }
  for (const b of Array.from(pdfopSeg.querySelectorAll<HTMLButtonElement>('.seg__btn'))) {
    b.addEventListener('click', () => {
      // Keep the button enabled (so its title tooltip shows on hover) and gate here.
      if (b.getAttribute('aria-disabled') === 'true') return;
      h.onOperation(String(b.dataset.op));
    });
  }
  for (const b of Array.from(combineRow.querySelectorAll<HTMLButtonElement>('[data-combine]'))) {
    b.addEventListener('click', () => h.onCombine(b.dataset.combine as 'one' | 'separate'));
  }
  for (const b of Array.from(scaleSeg.querySelectorAll<HTMLButtonElement>('.seg__btn'))) {
    b.addEventListener('click', () => h.onScale(Number(b.dataset.scale)));
  }
  for (const b of Array.from(docxSeg.querySelectorAll<HTMLButtonElement>('.seg__btn'))) {
    b.addEventListener('click', () => h.onDocxMode(b.dataset.docx as 'raster' | 'reflow'));
  }

  let renderedSig = '';

  function update(v: OptionsView): void {
    // Panel is also relevant for document-only inputs (PDF op picker / DOCX mode).
    if (v.rows.length === 0 && !v.showPdfOps && !v.showDocx) {
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

    resizeRow.style.display = v.showResize ? '' : 'none';
    resize.value = String(v.resize);
    resizeVal.textContent = v.resize >= 1 ? 'Original' : `${Math.round(v.resize * 100)}%`;

    combineRow.style.display = v.showCombine ? '' : 'none';

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

    // DOCX → PDF mode (Beta).
    docxRow.style.display = v.showDocx ? '' : 'none';
    if (v.showDocx) {
      for (const b of Array.from(docxSeg.querySelectorAll<HTMLButtonElement>('.seg__btn'))) {
        const active = b.dataset.docx === v.docxMode;
        b.classList.toggle('seg__btn--active', active);
        b.setAttribute('aria-checked', String(active));
      }
      syncPill(docxSeg);
    }

    // PDF operation picker (Rotate / Split).
    pdfopRow.style.display = v.showPdfOps ? '' : 'none';
    if (v.showPdfOps) {
      for (const b of Array.from(pdfopSeg.querySelectorAll<HTMLButtonElement>('.seg__btn'))) {
        const active = b.dataset.op === v.pdfOperation;
        b.classList.toggle('seg__btn--active', active);
        b.setAttribute('aria-checked', String(active));
        // Merge needs ≥2 PDFs. Keep the button enabled but mark it aria-disabled
        // (the click is gated); a CSS tooltip (data-tip) explains why on hover —
        // native `title` tooltips don't show reliably on these.
        if (b.dataset.op === 'merge') {
          b.classList.toggle('seg__btn--disabled', v.mergeDisabled);
          b.setAttribute('aria-disabled', String(v.mergeDisabled));
          if (v.mergeDisabled) b.dataset.tip = 'Add at least one more PDF';
          else delete b.dataset.tip;
        }
      }
      syncPill(pdfopSeg);
    }

    // PDF → DOCX is a best-effort text extraction; flag it (Beta) when chosen.
    pdfopHintRow.style.display =
      v.showPdfOps && v.pdfOperation === 'todocx' ? '' : 'none';

    // Angle sub-control: only meaningful for the rotate operation.
    const showRotate = v.showPdfOps && v.pdfOperation === 'rotate';
    rotateRow.style.display = showRotate ? '' : 'none';
    if (showRotate) {
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
