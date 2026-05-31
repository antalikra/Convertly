import type { Job } from '@app/controller';
import { inputCategory, type FormatId, type ProgressStage } from '@core/types';
import { formatBytes } from '@shared/format';
import { createFormatSelect } from './FormatSelect';
import { createOperationSelect, type OperationOption } from './OperationSelect';
import { createGroupSelect } from './GroupSelect';

/** File-list section keys, in display order. `other` = unsupported inputs. */
const GROUP_ORDER = ['image', 'audio', 'document', 'other'] as const;
type Group = (typeof GROUP_ORDER)[number];
const GROUP_LABEL: Record<Group, string> = {
  image: 'Images',
  audio: 'Audio',
  document: 'Documents',
  other: 'Other',
};

const groupOf = (v: JobView): Group => inputCategory(v.job.input) ?? 'other';

/** "M:SS" from seconds. */
function fmtDuration(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
}

/** Colour family for the file-type bubble (PDF red, DOCX blue, audio amber,
 *  everything else the accent violet). */
function bubbleKind(input: Job['input']): string {
  if (input.detectedFormat === 'pdf') return 'pdf';
  if (input.detectedFormat === 'docx') return 'docx';
  return inputCategory(input) === 'audio' ? 'audio' : 'image';
}

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
const CARET_ICON = '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6z"/></svg>';

export interface JobView {
  job: Job;
  /** Output formats selectable for this file (empty if unsupported). */
  options: FormatId[];
  /** Operation choices for a document file (empty for media). */
  docOps?: ReadonlyArray<OperationOption>;
  /** Current operation for a document file. */
  docOp?: string;
  /** Resolved target format, or null if unsupported. */
  target: FormatId | null;
  /** True when this file's target is an aggregate (merge / images→PDF) → grouping. */
  isAggregate?: boolean;
  /** This file's group number (when aggregate). */
  group?: number;
  /** Groups currently in use for its category (for the group dropdown). */
  groups?: number[];
}

export interface FileListCallbacks {
  onRemove(id: string): void;
  onDownload(id: string): void;
  onFormat(id: string, format: FormatId): void;
  /** Change a document file's operation (rotate / split / to text / …). */
  onOperation(id: string, op: string): void;
  /** Download a single output file of a multi-output (split) job by index. */
  onDownloadOutput(id: string, index: number): void;
  onGroup(id: string, group: number): void;
  onNewGroup(id: string): void;
  /** Drag-reorder: move `draggedId` before `targetId`, or to the end (null). */
  onReorder(draggedId: string, targetId: string | null): void;
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
          row = createRow(v, cb, beginDrag);
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

  // FLIP: animate the section's rows from their old to new positions after a live
  // DOM reorder during a drag (so siblings glide instead of jumping).
  function flipReorder(section: HTMLElement, mutate: () => void): void {
    const items = Array.from(section.querySelectorAll<HTMLElement>('.fileitem'));
    const before = new Map(items.map((it) => [it, it.getBoundingClientRect().top]));
    mutate();
    for (const it of items) {
      const dy = (before.get(it) ?? 0) - it.getBoundingClientRect().top;
      if (!dy) continue;
      it.style.transition = 'none';
      it.style.transform = `translateY(${dy}px)`;
      requestAnimationFrame(() => {
        it.style.transition = 'transform 180ms cubic-bezier(0.2,0,0,1)';
        it.style.transform = '';
      });
    }
  }

  // Pointer drag from a row's grip: a floating clone follows the cursor; siblings
  // shift (FLIP) to open the drop slot; the new order is committed on release.
  function beginDrag(rowEl: HTMLElement, jobId: string, ev: PointerEvent): void {
    ev.preventDefault();
    const section = rowEl.parentElement;
    if (!section) return;
    const rect = rowEl.getBoundingClientRect();
    const offX = ev.clientX - rect.left;
    const offY = ev.clientY - rect.top;

    const clone = rowEl.cloneNode(true) as HTMLElement;
    clone.classList.add('fileitem--ghost');
    clone.style.cssText =
      `position:fixed;margin:0;pointer-events:none;z-index:1000;width:${rect.width}px;` +
      `left:${rect.left}px;top:${rect.top}px;`;
    document.body.appendChild(clone);
    rowEl.classList.add('is-placeholder');
    document.body.classList.add('is-reordering');

    let moved = false;
    const onMove = (e: PointerEvent): void => {
      clone.style.left = `${e.clientX - offX}px`;
      clone.style.top = `${e.clientY - offY}px`;
      const sibs = Array.from(section.querySelectorAll<HTMLElement>('.fileitem')).filter(
        (s) => s !== rowEl,
      );
      let ref: HTMLElement | null = null;
      for (const s of sibs) {
        const r = s.getBoundingClientRect();
        if (e.clientY < r.top + r.height / 2) {
          ref = s;
          break;
        }
      }
      if (rowEl.nextElementSibling !== ref) {
        flipReorder(section, () => section.insertBefore(rowEl, ref));
        moved = true;
      }
    };
    const onUp = (): void => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      clone.remove();
      rowEl.classList.remove('is-placeholder');
      document.body.classList.remove('is-reordering');
      if (moved) {
        const next = rowEl.nextElementSibling as HTMLElement | null;
        cb.onReorder(jobId, next?.dataset.id ?? null);
      }
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }

  return { el, update };
}

function createRow(
  view: JobView,
  cb: FileListCallbacks,
  beginDrag: (rowEl: HTMLElement, id: string, ev: PointerEvent) => void,
): RowHandle {
  const id = view.job.input.id;

  const el = document.createElement('div');
  el.className = 'fileitem fileitem--enter';
  el.dataset.id = id; // read on drop to compute the new neighbour

  // The main flex line; a multi-output (split) job adds an expandable sublist below.
  const row = document.createElement('div');
  row.className = 'fileitem__row';

  // Drag handle (the only draggable part — keeps row controls clickable).
  const grip = document.createElement('span');
  grip.className = 'fileitem__grip';
  grip.title = 'Drag to reorder';
  grip.setAttribute('aria-label', 'Drag to reorder');
  grip.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>';
  grip.addEventListener('pointerdown', (e) => beginDrag(el, id, e));

  const bubble = document.createElement('span');
  bubble.className = `fbubble fbubble--${bubbleKind(view.job.input)}`;
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

  // Target selector: "→ [FORMAT ▾]  [G1 ▾]" (media) or "→ [OPERATION ▾]" (docs).
  const convert = document.createElement('div');
  convert.className = 'fileitem__convert';
  const fmtSelect = view.options.length > 0 ? createFormatSelect((f) => cb.onFormat(id, f)) : null;
  const opSelect =
    view.docOps && view.docOps.length > 0
      ? createOperationSelect((op) => cb.onOperation(id, op))
      : null;
  const picker = fmtSelect?.el ?? opSelect?.el;
  if (picker) {
    const arrow = document.createElement('span');
    arrow.className = 'fileitem__arrow';
    arrow.textContent = '→';
    convert.append(arrow, picker);
  }
  // Group selector (only shown for aggregate targets — merge / images→PDF).
  const groupSelect = createGroupSelect(
    (g) => cb.onGroup(id, g),
    () => cb.onNewGroup(id),
  );
  groupSelect.el.hidden = true;
  convert.append(groupSelect.el);

  const status = document.createElement('span');

  const actions = document.createElement('div');
  actions.className = 'fileitem__actions';
  // Expander (only shown for multi-output jobs) toggles the per-file list.
  let expanded = false;
  const expand = iconBtn(CARET_ICON, 'Show files');
  expand.classList.add('fileitem__expand');
  expand.hidden = true;
  const dl = iconBtn(DL_ICON, 'Download');
  dl.addEventListener('click', () => cb.onDownload(id));
  const rm = iconBtn(RM_ICON, 'Remove');
  rm.addEventListener('click', () => cb.onRemove(id));
  actions.append(expand, dl, rm);

  row.append(grip, bubble, info, convert, status, actions);

  // Per-file list for split output (built lazily; rebuilt when the count changes).
  const sublist = document.createElement('div');
  sublist.className = 'fileitem__sublist';
  sublist.hidden = true;
  let builtCount = -1;

  expand.addEventListener('click', () => {
    expanded = !expanded;
    sublist.hidden = !expanded;
    expand.classList.toggle('is-open', expanded);
    expand.title = expanded ? 'Hide files' : 'Show files';
  });

  el.append(row, sublist);

  // First paint animates; clear the class after so re-renders don't replay it.
  el.addEventListener('animationend', () => el.classList.remove('fileitem--enter'), { once: true });

  function update(v: JobView): void {
    if (fmtSelect && v.target) fmtSelect.update(v.target, v.options);
    if (opSelect && v.docOp) opSelect.update(v.docOp, v.docOps ?? []);
    if (v.isAggregate && v.group != null) {
      groupSelect.el.hidden = false;
      groupSelect.update(v.group, v.groups ?? [v.group]);
    } else {
      groupSelect.el.hidden = true;
    }
    const stage: ProgressStage = v.job.error ? 'error' : v.job.stage;
    setStatus(status, stage, v.job.error);

    // Show output size + savings once converted. A 1→N job (split) reports the
    // file count + combined size instead of a per-file delta.
    const outs = v.job.outputs;
    const orig = v.job.input.sizeBytes;
    const multi = !!outs && outs.length > 1;
    if (outs && outs.length > 1) {
      const total = outs.reduce((s, o) => s + o.blob.size, 0);
      meta.textContent = `${outs.length} files · ${formatBytes(total)}`;
    } else if (outs && outs.length === 1) {
      const size = outs[0].blob.size;
      const d = orig > 0 ? 1 - size / orig : 0;
      const pct = d >= 0 ? `−${Math.round(d * 100)}%` : `+${Math.round(-d * 100)}%`;
      meta.textContent = `${formatBytes(orig)} → ${formatBytes(size)} (${pct})`;
    } else {
      meta.textContent = formatBytes(orig);
    }
    if (v.job.input.durationSec) meta.textContent += ` · ${fmtDuration(v.job.input.durationSec)}`;
    dl.hidden = !(outs && outs.length > 0);
    dl.title = multi ? 'Download ZIP' : 'Download';

    // Multi-output: offer the expander + (re)build the per-file list on change.
    expand.hidden = !multi;
    if (multi && outs!.length !== builtCount) {
      builtCount = outs!.length;
      sublist.replaceChildren(...outs!.map((o, i) => subRow(o.fileName, o.blob.size, () => cb.onDownloadOutput(id, i))));
    } else if (!multi) {
      builtCount = -1;
      expanded = false;
      sublist.hidden = true;
      expand.classList.remove('is-open');
      sublist.replaceChildren();
    }
  }

  function destroy(): void {
    fmtSelect?.destroy();
    opSelect?.destroy();
    groupSelect.destroy();
  }

  return { el, update, destroy };
}

/** One row inside a split job's expanded file list: name · size · download. */
function subRow(fileName: string, size: number, onDownload: () => void): HTMLElement {
  const el = document.createElement('div');
  el.className = 'suboutput';
  const name = document.createElement('span');
  name.className = 'suboutput__name';
  name.textContent = fileName;
  name.title = fileName;
  const sz = document.createElement('span');
  sz.className = 'suboutput__size';
  sz.textContent = formatBytes(size);
  const dl = iconBtn(DL_ICON, 'Download');
  dl.addEventListener('click', onDownload);
  el.append(name, sz, dl);
  return el;
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
