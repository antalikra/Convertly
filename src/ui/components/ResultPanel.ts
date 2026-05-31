import { formatBytes } from '@shared/format';

const DL_ICON = '<svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7zM5 18v2h14v-2z"/></svg>';

export interface ResultView {
  id: string;
  fileName: string;
  /** How many inputs were combined into this file. */
  sourceCount: number;
  sizeBytes: number;
}

export interface ResultPanelHandle {
  el: HTMLElement;
  update(results: ResultView[]): void;
}

/**
 * Result card for aggregate (N→1) outputs — the combined files from Merge /
 * images→PDF. Sits below the file list and lists each combined file with its own
 * download. Hidden when there are no aggregate results for the active tab.
 */
export function createResultPanel(onDownload: (id: string) => void): ResultPanelHandle {
  const el = document.createElement('section');
  el.className = 'group';
  el.hidden = true;
  el.innerHTML = `<h2>Result</h2><div class="filelist" data-rows></div>`;
  const rowsEl = el.querySelector<HTMLElement>('[data-rows]')!;

  function update(results: ResultView[]): void {
    if (results.length === 0) {
      el.hidden = true;
      rowsEl.replaceChildren();
      return;
    }
    el.hidden = false;
    rowsEl.replaceChildren(...results.map((r) => row(r, onDownload)));
  }

  return { el, update };
}

function row(r: ResultView, onDownload: (id: string) => void): HTMLElement {
  const el = document.createElement('div');
  el.className = 'fileitem';

  const line = document.createElement('div');
  line.className = 'fileitem__row';

  const bubble = document.createElement('span');
  bubble.className = 'fbubble';
  bubble.textContent = 'PDF';

  const info = document.createElement('div');
  info.className = 'fileitem__info';
  const name = document.createElement('div');
  name.className = 'fileitem__name';
  name.textContent = r.fileName;
  name.title = r.fileName;
  const meta = document.createElement('div');
  meta.className = 'fileitem__meta';
  meta.textContent = `${r.sourceCount} files · ${formatBytes(r.sizeBytes)}`;
  info.append(name, meta);

  const badge = document.createElement('span');
  badge.className = 'badge badge--success';
  badge.textContent = 'Done';

  const actions = document.createElement('div');
  actions.className = 'fileitem__actions';
  const dl = document.createElement('button');
  dl.type = 'button';
  dl.className = 'btn btn--icon btn--ghost';
  dl.title = 'Download';
  dl.innerHTML = DL_ICON;
  dl.addEventListener('click', () => onDownload(r.id));
  actions.append(dl);

  line.append(bubble, info, badge, actions);
  el.append(line);
  return el;
}
