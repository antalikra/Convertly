import { type Category, type FormatId } from '@core/types';

const LABEL: Record<string, string> = {
  jpeg: 'JPG',
  png: 'PNG',
  webp: 'WebP',
  avif: 'AVIF',
  tiff: 'TIFF',
  bmp: 'BMP',
  wav: 'WAV',
  mp3: 'MP3',
};

const CAT_LABEL: Record<Category, string> = {
  image: 'Image format',
  audio: 'Audio format',
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
}

export interface OptionsHandlers {
  onFormat(category: Category, format: FormatId): void;
  onQuality(quality: number): void;
  onResize(resize: number): void;
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
  `;

  const formats = el.querySelector<HTMLElement>('[data-formats]')!;
  const quality = el.querySelector<HTMLInputElement>('#quality')!;
  const qualityVal = el.querySelector<HTMLSpanElement>('[data-quality-val]')!;
  const qualityRow = el.querySelector<HTMLElement>('[data-quality-row]')!;
  const resize = el.querySelector<HTMLInputElement>('#resize')!;
  const resizeVal = el.querySelector<HTMLSpanElement>('[data-resize-val]')!;
  const resizeRow = el.querySelector<HTMLElement>('[data-resize-row]')!;

  quality.addEventListener('input', () => h.onQuality(Number(quality.value)));
  resize.addEventListener('input', () => h.onResize(Number(resize.value)));

  let renderedSig = '';

  function update(v: OptionsView): void {
    if (v.rows.length === 0) {
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
