import type { FormatId } from '@core/types';

const LABEL: Record<string, string> = {
  jpeg: 'JPG', png: 'PNG', webp: 'WebP', avif: 'AVIF', tiff: 'TIFF', bmp: 'BMP', wav: 'WAV', mp3: 'MP3', ogg: 'OGG', pdf: 'PDF',
};
const label = (f: FormatId) => LABEL[f] ?? f.toUpperCase();

const CARET = '<svg viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg>';

export interface FormatSelectHandle {
  el: HTMLElement;
  update(value: FormatId, options: FormatId[]): void;
  /** Tear down: remove the capture-phase document listener if the menu is open. */
  destroy(): void;
}

/** Custom themed dropdown (replaces the native <select>, which Chrome renders
 *  unstyled). Open with click / Enter / Space / ArrowDown; close with Esc or an
 *  outside click; navigate options with the arrow keys; choose with Enter. */
export function createFormatSelect(onChange: (format: FormatId) => void): FormatSelectHandle {
  const el = document.createElement('div');
  el.className = 'fmt-select';

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'fmt-select__trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');

  const menu = document.createElement('div');
  menu.className = 'fmt-select__menu';
  menu.setAttribute('role', 'listbox');

  el.append(trigger, menu);

  let opts: FormatId[] = [];
  let value: FormatId | null = null;
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
    menu.classList.toggle('fmt-select__menu--up', roomBelow < 200 && r.top > roomBelow);
    el.classList.add('is-open');
    trigger.setAttribute('aria-expanded', 'true');
    document.addEventListener('click', onDoc, true);
    if (focusActive) {
      const list = optButtons();
      const active = list.findIndex((o) => o.dataset.fmt === value);
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

  // Arrow navigation / select / close from within the option list.
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
      // Esc returns focus to the trigger; Tab lets focus leave naturally.
      close(e.key === 'Escape');
    }
  });

  function buildMenu(): void {
    menu.replaceChildren(
      ...opts.map((f) => {
        const o = document.createElement('button');
        o.type = 'button';
        o.className = 'fmt-select__opt';
        o.dataset.fmt = f;
        o.tabIndex = -1; // roving: focus is moved programmatically, not via Tab
        o.setAttribute('role', 'option');
        o.setAttribute('aria-selected', 'false');
        o.textContent = label(f);
        const choose = (e: Event) => {
          e.stopPropagation();
          close(true);
          if (f !== value) onChange(f);
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

  function update(v: FormatId, options: FormatId[]): void {
    if (options.join(',') !== opts.join(',')) {
      opts = options.slice();
      buildMenu();
    }
    value = v;
    trigger.innerHTML = `<span>${label(v)}</span>${CARET}`;
    for (const o of optButtons()) {
      const active = o.dataset.fmt === v;
      o.classList.toggle('is-active', active);
      o.setAttribute('aria-selected', String(active));
    }
  }

  function destroy(): void {
    // Drop the capture-phase listener if the row is removed while open.
    document.removeEventListener('click', onDoc, true);
    open = false;
  }

  return { el, update, destroy };
}
