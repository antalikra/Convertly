import type { Job } from '@app/controller';
import { inputCategory, type FormatId, type ProgressStage } from '@core/types';
import { formatBytes } from '@shared/format';
import { createFormatSelect } from './FormatSelect';

/** File-list section keys, in display order. `other` = unsupported inputs. */
const GROUP_ORDER = ['image', 'audio', 'other'] as const;
type Group = (typeof GROUP_ORDER)[number];
const GROUP_LABEL: Record<Group, string> = { image: 'Images', audio: 'Audio', other: 'Other' };

const groupOf = (v: JobView): Group => inputCategory(v.job.input) ?? 'other';

/** Re-append nodes into `container` in `desired` order, but only if the current
 *  DOM order differs (progress ticks fire a render per file — avoid churn). */
function reorder(container: HTMLElement, desired: HTMLElement[]): void {
  const current = Array.from(container.children);
  if (current.length === desired.length && current.every((n, i) => n === desired[i])) return;
  for (const node of desired) container.appendChild(node);
}

const STAGE_LABEL: Record<ProgressStage, string> = {
  queued: 'Queued',
  decoding: 'Decoding',
  encoding: 'Encoding',
  done: 'Done',
  error: 'Error',
};

const DL_ICON = '<svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7zM5 18v2h14v-2z"/></svg>';
const RM_ICON = '<svg viewBox="0 0 24 24"><path d="M18.3 5.71 12 12l6.3 6.29-1.41 1.42L10.59 13.4 4.3 19.71l-1.42-1.42L9.17 12 2.88 5.71 4.3 4.29l6.29 6.3 6.3-6.3z"/></svg>';

export interface JobView {
  job: Job;
  /** Output formats selectable for this file (empty if unsupported). */
  options: FormatId[];
  /** Resolved target format, or null if unsupported. */
  target: FormatId | null;
}

export interface FileListCallbacks {
  onRemove(id: string): void;
  onDownload(id: string): void;
  onFormat(id: string, format: FormatId): void;
}

interface RowHandle {
  el: HTMLElement;
  update(view: JobView): void;
  /** Release per-row resources (e.g. the FormatSelect document listener). */
  destroy(): void;
}

export interface FileListHandle {
  el: HTMLElement;
  update(views: JobView[]): void;
}

interface Section {
  /** A standalone `.group` card (its own tile) for this category. */
  wrap: HTMLElement;
  label: HTMLElement;
  body: HTMLElement;
}

export function createFileList(cb: FileListCallbacks): FileListHandle {
  // A plain column that holds one `.group` card PER category — so Images and
  // Audio are visually separate tiles, not subheaders inside one card.
  const el = document.createElement('div');
  el.className = 'filelist-wrap';

  const rows = new Map<string, RowHandle>();
  const sections = new Map<Group, Section>();

  function ensureSection(g: Group): Section {
    let s = sections.get(g);
    if (s) return s;
    const wrap = document.createElement('div');
    wrap.className = 'group';
    const label = document.createElement('h2'); // styled by `.group > h2`
    const body = document.createElement('div');
    body.className = 'filelist';
    wrap.append(label, body);
    s = { wrap, label, body };
    sections.set(g, s);
    return s;
  }

  function update(views: JobView[]): void {
    if (views.length === 0) {
      el.hidden = true;
      for (const row of rows.values()) row.destroy();
      rows.clear();
      sections.clear();
      el.replaceChildren();
      return;
    }
    el.hidden = false;

    // Bucket views by category, preserving their incoming order.
    const byGroup = new Map<Group, JobView[]>();
    for (const v of views) {
      const g = groupOf(v);
      (byGroup.get(g) ?? byGroup.set(g, []).get(g)!).push(v);
    }

    const seen = new Set<string>();
    for (const g of GROUP_ORDER) {
      const list = byGroup.get(g);
      if (!list) continue;
      const s = ensureSection(g);
      s.label.textContent = `${GROUP_LABEL[g]} (${list.length})`;
      for (const v of list) {
        const id = v.job.input.id;
        seen.add(id);
        let row = rows.get(id);
        if (!row) {
          row = createRow(v, cb);
          rows.set(id, row);
          s.body.appendChild(row.el); // new node animates in via CSS
        }
        row.update(v);
      }
      reorder(s.body, list.map((v) => rows.get(v.job.input.id)!.el));
    }

    // Remove rows whose files are gone.
    for (const [id, row] of rows) {
      if (!seen.has(id)) {
        row.destroy();
        row.el.remove();
        rows.delete(id);
      }
    }

    // Drop empty category cards, then order the surviving ones (image→audio→other).
    for (const [g, s] of sections) {
      if (!byGroup.has(g)) {
        s.wrap.remove();
        sections.delete(g);
      }
    }
    reorder(
      el,
      GROUP_ORDER.filter((g) => sections.has(g)).map((g) => sections.get(g)!.wrap),
    );
  }

  return { el, update };
}

function createRow(view: JobView, cb: FileListCallbacks): RowHandle {
  const id = view.job.input.id;

  const el = document.createElement('div');
  el.className = 'fileitem fileitem--enter';

  const bubble = document.createElement('span');
  bubble.className = 'fbubble';
  bubble.textContent = view.job.input.detectedFormat.slice(0, 4).toUpperCase();

  const info = document.createElement('div');
  info.className = 'fileitem__info';
  const name = document.createElement('div');
  name.className = 'fileitem__name';
  name.textContent = view.job.input.name;
  name.title = view.job.input.name;
  const meta = document.createElement('div');
  meta.className = 'fileitem__meta';
  meta.textContent = formatBytes(view.job.input.sizeBytes);
  info.append(name, meta);

  // Target selector: "→ [FORMAT ▾]"
  const convert = document.createElement('div');
  convert.className = 'fileitem__convert';
  const fmtSelect = view.options.length > 0 ? createFormatSelect((f) => cb.onFormat(id, f)) : null;
  if (fmtSelect) {
    const arrow = document.createElement('span');
    arrow.className = 'fileitem__arrow';
    arrow.textContent = '→';
    convert.append(arrow, fmtSelect.el);
  }

  const status = document.createElement('span');

  const actions = document.createElement('div');
  actions.className = 'fileitem__actions';
  const dl = iconBtn(DL_ICON, 'Download');
  dl.addEventListener('click', () => cb.onDownload(id));
  const rm = iconBtn(RM_ICON, 'Remove');
  rm.addEventListener('click', () => cb.onRemove(id));
  actions.append(dl, rm);

  el.append(bubble, info, convert, status, actions);

  // First paint animates; clear the class after so re-renders don't replay it.
  el.addEventListener('animationend', () => el.classList.remove('fileitem--enter'), { once: true });

  function update(v: JobView): void {
    if (fmtSelect && v.target) fmtSelect.update(v.target, v.options);
    const stage: ProgressStage = v.job.error ? 'error' : v.job.stage;
    setStatus(status, stage, v.job.error);

    // Show output size + savings once converted.
    const out = v.job.output;
    if (out) {
      const orig = v.job.input.sizeBytes;
      const d = orig > 0 ? 1 - out.blob.size / orig : 0;
      const pct = d >= 0 ? `−${Math.round(d * 100)}%` : `+${Math.round(-d * 100)}%`;
      meta.textContent = `${formatBytes(orig)} → ${formatBytes(out.blob.size)} (${pct})`;
    } else {
      meta.textContent = formatBytes(v.job.input.sizeBytes);
    }
    dl.hidden = !out;
  }

  function destroy(): void {
    fmtSelect?.destroy();
  }

  return { el, update, destroy };
}

function setStatus(node: HTMLElement, stage: ProgressStage, error?: string): void {
  node.className = '';
  node.removeAttribute('title');
  if (stage === 'decoding' || stage === 'encoding') {
    node.className = 'spinner';
    node.title = STAGE_LABEL[stage];
    node.textContent = '';
    return;
  }
  node.className = 'badge';
  if (stage === 'done') node.classList.add('badge--success');
  else if (stage === 'error') node.classList.add('badge--error');
  else node.classList.add('badge--accent');
  node.textContent = stage === 'error' ? 'Error' : STAGE_LABEL[stage];
  if (error) node.title = error;
}

function iconBtn(svg: string, title: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn btn--icon btn--ghost';
  b.title = title;
  b.innerHTML = svg;
  return b;
}
