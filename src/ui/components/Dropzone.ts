// Dumb presentation component: renders a drop area + file picker and emits the
// picked File[] via the onFiles callback. It knows nothing about conversion.

export interface DropzoneView {
  title: string;
  sub: string;
  /** Supported formats / operations line (empty in the compact bar). */
  formats: string;
  /** A slim one-line bar instead of the big drop area (the tab already has files). */
  compact: boolean;
  /** The "nothing is uploaded" line under the big drop area. */
  privacy: string;
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
    <span class="dropzone__text">
      <span class="dropzone__title" data-title></span>
      <span class="dropzone__sub" data-sub></span>
    </span>
    <span class="dropzone__formats" data-formats></span>
    <span class="dropzone__privacy" data-privacy>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5zm-3 8V7a3 3 0 0 1 6 0v3z"/></svg>
      <span data-privacy-text></span>
    </span>
  `;

  const picker = el.querySelector<HTMLInputElement>('input')!;
  const titleEl = el.querySelector<HTMLElement>('[data-title]')!;
  const subEl = el.querySelector<HTMLElement>('[data-sub]')!;
  const formatsEl = el.querySelector<HTMLElement>('[data-formats]')!;
  const privacyEl = el.querySelector<HTMLElement>('[data-privacy]')!;
  const privacyText = el.querySelector<HTMLElement>('[data-privacy-text]')!;

  function update(view: DropzoneView): void {
    titleEl.textContent = view.title;
    subEl.textContent = view.sub;
    formatsEl.textContent = view.formats;
    formatsEl.hidden = !view.formats;
    privacyText.textContent = view.privacy;
    privacyEl.hidden = !view.privacy;
    el.classList.toggle('dropzone--compact', view.compact);
    el.setAttribute('aria-label', `${view.title} — ${view.sub}`);
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
