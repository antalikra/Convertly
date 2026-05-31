const CARET = '<svg viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg>';

export interface GroupSelectHandle {
  el: HTMLElement;
  update(current: number, groups: number[]): void;
  destroy(): void;
}

/**
 * Small dropdown to assign a file to an aggregate group ("G1 ▾"). Lists the
 * groups currently in use plus "+ New group". Reuses the `.fmt-select` styling
 * (themed dropdown) — only the values differ.
 */
export function createGroupSelect(
  onChange: (group: number) => void,
  onNew: () => void,
): GroupSelectHandle {
  const el = document.createElement('div');
  el.className = 'fmt-select grp-select';

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'fmt-select__trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');

  const menu = document.createElement('div');
  menu.className = 'fmt-select__menu';
  menu.setAttribute('role', 'listbox');

  el.append(trigger, menu);

  let open = false;
  let current = 1;
  let groups: number[] = [];

  const onDoc = (e: MouseEvent) => {
    if (!el.contains(e.target as Node)) close();
  };

  function openMenu(): void {
    if (open) return;
    open = true;
    const r = trigger.getBoundingClientRect();
    const roomBelow = window.innerHeight - r.bottom;
    menu.classList.toggle('fmt-select__menu--up', roomBelow < 200 && r.top > roomBelow);
    el.classList.add('is-open');
    trigger.setAttribute('aria-expanded', 'true');
    document.addEventListener('click', onDoc, true);
  }

  function close(): void {
    if (!open) return;
    open = false;
    el.classList.remove('is-open');
    trigger.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', onDoc, true);
  }

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    open ? close() : openMenu();
  });

  function opt(label: string, active: boolean, handler: (e: Event) => void): HTMLButtonElement {
    const o = document.createElement('button');
    o.type = 'button';
    o.className = 'fmt-select__opt';
    o.setAttribute('role', 'option');
    o.textContent = label;
    if (active) o.classList.add('is-active');
    o.addEventListener('click', handler);
    return o;
  }

  function build(): void {
    const items = groups.map((g) =>
      opt(`Group ${g}`, g === current, (e) => {
        e.stopPropagation();
        close();
        if (g !== current) onChange(g);
      }),
    );
    const add = opt('+ New group', false, (e) => {
      e.stopPropagation();
      close();
      onNew();
    });
    add.classList.add('fmt-select__opt--new');
    menu.replaceChildren(...items, add);
  }

  function update(c: number, gs: number[]): void {
    current = c;
    groups = gs.length > 0 ? gs.slice() : [c];
    trigger.innerHTML = `<span>G${c}</span>${CARET}`;
    build();
  }

  function destroy(): void {
    document.removeEventListener('click', onDoc, true);
    open = false;
  }

  return { el, update, destroy };
}
