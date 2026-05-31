// Dumb presentation component: renders a drop area + file picker and emits the
// picked File[] via the onFiles callback. It knows nothing about conversion.

export interface DropzoneView {
  title: string;
  sub: string;
  /** `accept` attribute for the file picker (drag-drop is unrestricted). */
  accept: string;
}

export interface DropzoneHandle {
  el: HTMLElement;
  /** Retarget the hint + picker filter (per active tab). */
  update(view: DropzoneView): void;
}

export function createDropzone(onFiles: (files: File[]) => void): DropzoneHandle {
  const el = document.createElement('label');
  el.className = 'dropzone';
  el.tabIndex = 0;
  el.setAttribute('role', 'button');
  el.innerHTML = `
    <input type="file" multiple hidden />
    <span class="dropzone__icon" aria-hidden="true">
      <svg viewBox="0 0 24 24"><path d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z"/></svg>
    </span>
    <span class="dropzone__title" data-title>Drop files here</span>
    <span class="dropzone__sub" data-sub></span>
  `;

  const picker = el.querySelector<HTMLInputElement>('input')!;
  const titleEl = el.querySelector<HTMLElement>('[data-title]')!;
  const subEl = el.querySelector<HTMLElement>('[data-sub]')!;

  function update(view: DropzoneView): void {
    titleEl.textContent = view.title;
    subEl.textContent = view.sub;
    picker.accept = view.accept;
  }

  // <label> opens the picker natively on mouse click; only wire the keyboard.
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      picker.click();
    }
  });

  picker.addEventListener('change', () => {
    if (picker.files && picker.files.length) {
      onFiles(Array.from(picker.files));
      picker.value = '';
    }
  });

  const stop = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
  };
  ['dragenter', 'dragover'].forEach((ev) =>
    el.addEventListener(ev, (e) => {
      stop(e);
      el.classList.add('dropzone--active');
    }),
  );
  ['dragleave', 'dragend'].forEach((ev) =>
    el.addEventListener(ev, (e) => {
      stop(e);
      el.classList.remove('dropzone--active');
    }),
  );
  el.addEventListener('drop', (e) => {
    stop(e);
    el.classList.remove('dropzone--active');
    const files = e.dataTransfer?.files;
    if (files && files.length) onFiles(Array.from(files));
  });

  return { el, update };
}
