export interface OperationOption {
  id: string;
  label: string;
}

export interface OperationSelectHandle {
  el: HTMLElement;
  update(value: string, options: ReadonlyArray<OperationOption>): void;
  /** Tear down: remove the capture-phase document listener if the menu is open. */
  destroy(): void;
}

const CARET = '<svg viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg>';

/**
 * Per-file document operation dropdown (PDF: rotate/split/…; DOCX: to PDF/text/
 * HTML). Same themed/animated popover as FormatSelect — reuses its `.fmt-select`
 * styles — but its options are {id,label} operations, not formats.
 */
export function createOperationSelect(onChange: (id: string) => void): OperationSelectHandle {
  const el = document.createElement('div');
  el.className = 'fmt-select fmt-select--op';

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'fmt-select__trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');

  const menu = document.createElement('div');
  menu.className = 'fmt-select__menu';
  menu.setAttribute('role', 'listbox');

  el.append(trigger, menu);

  let opts: ReadonlyArray<OperationOption> = [];
  let value: string | null = null;
  let open = false;

  const onDoc = (e: MouseEvent) => {
    if (!el.contains(e.target as Node)) close();
  };

  const optButtons = (): HTMLButtonElement[] =>
    Array.from(menu.querySelectorAll<HTMLButtonElement>('.fmt-select__opt'));

  function focusOpt(index: number): void {
    const list = optButtons();
    if (list.length === 0) return;
    const i = (index + list.length) % list.length;
    list[i].focus();
  }

  function openMenu(focusActive = true): void {
    if (open) return;
    open = true;
    // Flip upward if there isn't room below (e.g. last row near the action bar).
    const r = trigger.getBoundingClientRect();
    const roomBelow = window.innerHeight - r.bottom;
    menu.classList.toggle('fmt-select__menu--up', roomBelow < 240 && r.top > roomBelow);
    el.classList.add('is-open');
    trigger.setAttribute('aria-expanded', 'true');
    document.addEventListener('click', onDoc, true);
    if (focusActive) {
      const list = optButtons();
      const active = list.findIndex((o) => o.dataset.op === value);
      focusOpt(active >= 0 ? active : 0);
    }
  }

  function close(returnFocus = false): void {
    if (!open) return;
    open = false;
    el.classList.remove('is-open');
    trigger.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', onDoc, true);
    if (returnFocus) trigger.focus();
  }

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    open ? close() : openMenu(false);
  });

  trigger.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) openMenu(true);
      else focusOpt(0);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) openMenu(true);
      else focusOpt(-1);
    } else if (e.key === 'Escape') {
      close(true);
    }
  });

  menu.addEventListener('keydown', (e) => {
    const list = optButtons();
    const current = list.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusOpt(current + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusOpt(current - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      focusOpt(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      focusOpt(-1);
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      close(e.key === 'Escape');
    }
  });

  function buildMenu(): void {
    menu.replaceChildren(
      ...opts.map((opt) => {
        const o = document.createElement('button');
        o.type = 'button';
        o.className = 'fmt-select__opt';
        o.dataset.op = opt.id;
        o.tabIndex = -1; // roving focus
        o.setAttribute('role', 'option');
        o.setAttribute('aria-selected', 'false');
        o.textContent = opt.label;
        const choose = (e: Event) => {
          e.stopPropagation();
          close(true);
          if (opt.id !== value) onChange(opt.id);
        };
        o.addEventListener('click', choose);
        o.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            choose(e);
          }
        });
        return o;
      }),
    );
  }

  function update(v: string, options: ReadonlyArray<OperationOption>): void {
    const sig = options.map((o) => o.id).join(',');
    if (sig !== opts.map((o) => o.id).join(',')) {
      opts = options.slice();
      buildMenu();
    }
    value = v;
    const current = opts.find((o) => o.id === v);
    trigger.innerHTML = `<span>${current?.label ?? v}</span>${CARET}`;
    for (const o of optButtons()) {
      const active = o.dataset.op === v;
      o.classList.toggle('is-active', active);
      o.setAttribute('aria-selected', String(active));
    }
  }

  function destroy(): void {
    document.removeEventListener('click', onDoc, true);
    open = false;
  }

  return { el, update, destroy };
}
