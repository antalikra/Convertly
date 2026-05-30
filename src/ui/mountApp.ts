import { Controller, type AppState } from '@app/controller';
import { LOSSY_FORMATS, inputCategory, type FormatId } from '@core/types';
import type { ThemeMode } from '@infra/settings';
import { formatBytes } from '@shared/format';
import { createDropzone } from './components/Dropzone';
import { createOptionsPanel } from './components/OptionsPanel';
import { createFileList } from './components/FileList';
import './styles/app.css';

/** Show the CPU-freeze warning once a batch is at least this many files (AVIF
 *  warns at any count — its encoder is multi-threaded). */
const HEAVY_BATCH = 10;

const MOON_ICON =
  '<svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.39 5.39 0 0 1-7.54-7.54C12.92 3.04 12.46 3 12 3z"/></svg>';
const SUN_ICON =
  '<svg viewBox="0 0 24 24"><path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0-5 2 3h-4zm0 20-2-3h4zM2 12l3-2v4zm20 0-3 2v-4zM5 5l3 1-2 2zm14 14-3-1 2-2zM5 19l1-3 2 2zM19 5l-1 3-2-2z"/></svg>';
const HEART_ICON =
  '<svg viewBox="0 0 24 24"><path d="M12 21s-7.5-4.6-10-9.3C.6 8.6 2.2 5.5 5.3 5.5c1.9 0 3.3 1.1 4.7 2.9 1.4-1.8 2.8-2.9 4.7-2.9 3.1 0 4.7 3.1 3.3 6.2C19.5 16.4 12 21 12 21z"/></svg>';

/** Mounts the full converter UI into `root` (runs in the persistent window). */
export function mountApp(root: HTMLElement): Controller {
  // Default to dark immediately so the tokens resolve before settings load.
  document.body.setAttribute('data-theme', 'dark');

  const controller = new Controller();

  root.innerHTML = `
    <div class="shell">
      <header class="topbar">
        <span class="brand__dot"></span>
        <div class="brand">
          <div>
            <h1 class="brand__name">Convertly</h1>
            <p class="brand__tagline">Convert images & audio — on your device.</p>
          </div>
        </div>
        <div class="support" data-support>
          <button class="btn btn--icon btn--ghost" data-support-btn type="button" title="Support Convertly">${HEART_ICON}</button>
          <div class="support__menu">
            <span class="support__title">Free &amp; local. Support development ♥</span>
            <a class="support__link" href="https://ko-fi.com/antalikra" target="_blank" rel="noopener noreferrer">☕ Ko-fi</a>
            <a class="support__link" href="https://www.paypal.com/donate/?hosted_button_id=AXQ9EVTZL6TDA" target="_blank" rel="noopener noreferrer">PayPal</a>
          </div>
        </div>
        <button class="btn btn--icon btn--ghost" data-theme type="button" title="Toggle theme"></button>
      </header>
      <div class="content">
        <div class="notice" data-notice hidden></div>
        <div data-slot="dropzone"></div>
        <div data-slot="options"></div>
        <div data-slot="list"></div>
      </div>
      <footer class="actionbar" data-slot="actions" hidden>
        <div class="actionbar__warn" data-heavy-warn hidden>
          ⚠ Large batches use every CPU core — the window may stutter or freeze briefly while it works. It still finishes.
        </div>
        <div class="actionbar__inner">
          <span class="actionbar__summary" data-summary></span>
          <div class="actionbar__buttons">
            <button class="btn btn--ghost" data-clear type="button">Clear</button>
            <button class="btn btn--ghost" data-zip type="button" hidden>Download ZIP</button>
            <button class="btn btn--ghost" data-pause type="button" hidden>Pause</button>
            <button class="btn btn--ghost" data-cancel type="button" hidden>Cancel</button>
            <button class="btn btn--ghost" data-reconvert type="button" hidden>Reconvert all</button>
            <button class="btn btn--primary btn--lg" data-convert type="button">Convert</button>
          </div>
        </div>
      </footer>
    </div>
  `;

  const dropzone = createDropzone((files) => void controller.addFiles(files));
  const options = createOptionsPanel({
    onFormat: (category, format) =>
      void controller.updateSettings(
        category === 'audio' ? { audioFormat: format } : { imageFormat: format },
      ),
    onQuality: (quality) => void controller.updateSettings({ quality }),
    onResize: (resize) => void controller.updateSettings({ resize }),
  });
  const fileList = createFileList({
    onRemove: (id) => controller.removeJob(id),
    onDownload: (id) => controller.downloadOne(id),
    onFormat: (id, format) => controller.setJobFormat(id, format),
  });

  root.querySelector('[data-slot="dropzone"]')!.appendChild(dropzone.el);
  root.querySelector('[data-slot="options"]')!.appendChild(options.el);
  root.querySelector('[data-slot="list"]')!.appendChild(fileList.el);

  const actions = root.querySelector<HTMLElement>('[data-slot="actions"]')!;
  const summary = root.querySelector<HTMLElement>('[data-summary]')!;
  const clearBtn = root.querySelector<HTMLButtonElement>('[data-clear]')!;
  const zipBtn = root.querySelector<HTMLButtonElement>('[data-zip]')!;
  const pauseBtn = root.querySelector<HTMLButtonElement>('[data-pause]')!;
  const cancelBtn = root.querySelector<HTMLButtonElement>('[data-cancel]')!;
  const reconvertBtn = root.querySelector<HTMLButtonElement>('[data-reconvert]')!;
  const convertBtn = root.querySelector<HTMLButtonElement>('[data-convert]')!;
  const themeBtn = root.querySelector<HTMLButtonElement>('[data-theme]')!;
  const noticeEl = root.querySelector<HTMLElement>('[data-notice]')!;
  const heavyWarn = root.querySelector<HTMLElement>('[data-heavy-warn]')!;

  clearBtn.addEventListener('click', () => controller.clear());
  zipBtn.addEventListener('click', () => void controller.downloadAllZip());
  pauseBtn.addEventListener('click', () => controller.togglePause());
  cancelBtn.addEventListener('click', () => controller.cancelConversion());
  reconvertBtn.addEventListener('click', () => void controller.convertAll(true));
  convertBtn.addEventListener('click', () => void controller.convertAll(false));
  themeBtn.addEventListener('click', () => {
    const next: ThemeMode = controller.getState().settings.theme === 'dark' ? 'light' : 'dark';
    // Enable the global crossfade only for this toggle, then remove it.
    document.body.classList.add('theming');
    window.setTimeout(() => document.body.classList.remove('theming'), 280);
    void controller.updateSettings({ theme: next });
  });

  // Support menu (Ko-fi / PayPal) — opens external links in a new browser tab.
  const support = root.querySelector<HTMLElement>('[data-support]')!;
  const supportBtn = root.querySelector<HTMLButtonElement>('[data-support-btn]')!;
  supportBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    support.classList.toggle('is-open');
  });
  document.addEventListener('click', (e) => {
    if (!support.contains(e.target as Node)) support.classList.remove('is-open');
  });

  // One-shot heartbeat on the ♥ when a conversion finishes (see render()).
  supportBtn.addEventListener('animationend', () => supportBtn.classList.remove('is-beating'));
  let wasConverting = false;

  controller.subscribe((state) => render(state));
  void controller.init();

  function render(state: AppState): void {
    document.body.setAttribute('data-theme', state.settings.theme);
    themeBtn.innerHTML = state.settings.theme === 'dark' ? MOON_ICON : SUN_ICON;

    noticeEl.hidden = !state.notice;
    noticeEl.textContent = state.notice ?? '';

    // Empty state: let the dropzone grow to fill the window (avoids voids).
    document.body.classList.toggle('is-empty', state.jobs.length === 0);

    const rows = controller.categoriesPresent().map((category) => ({
      category,
      available: controller.availableOutputFormats(category),
      selected: controller.targetFormat(category),
    }));
    const selected: FormatId[] = rows.map((r) => r.selected);
    const hasImage = rows.some((r) => r.category === 'image');
    options.update({
      rows,
      quality: state.settings.quality,
      showQuality: selected.some((f) => LOSSY_FORMATS.includes(f)),
      resize: state.settings.resize,
      showResize: hasImage,
    });

    fileList.update(
      state.jobs.map((job) => {
        const category = inputCategory(job.input);
        return {
          job,
          options: category ? controller.availableOutputFormats(category) : [],
          target: controller.resolveTarget(job),
        };
      }),
    );

    // When a conversion finishes (converting: true → false with ≥1 success),
    // pulse the support ♥ once — it's the moment the user just got their files.
    const doneCount = state.jobs.filter((j) => j.output).length;
    if (wasConverting && !state.converting && doneCount > 0) {
      supportBtn.classList.remove('is-beating');
      void supportBtn.offsetWidth; // reflow so the animation restarts if mid-beat
      supportBtn.classList.add('is-beating');
    }
    wasConverting = state.converting;

    const hasJobs = state.jobs.length > 0;
    actions.hidden = !hasJobs;
    if (!hasJobs) return;

    const done = state.jobs.filter((j) => j.output).length;
    const errors = state.jobs.filter((j) => j.error).length;
    const total = state.jobs.length;

    let origBytes = 0;
    let outBytes = 0;
    for (const j of state.jobs) {
      if (j.output) {
        origBytes += j.input.sizeBytes;
        outBytes += j.output.blob.size;
      }
    }

    summary.textContent = state.converting
      ? `${state.paused ? 'Paused' : 'Converting…'} ${done}/${total}`
      : describe(total, done, errors, origBytes, outBytes);

    // Warn about a possible UI freeze right by the Convert button (proactive,
    // before clicking): any large batch can saturate the CPU, and AVIF does even
    // at low counts (its encoder is multi-threaded).
    const convertible = controller.convertibleJobs().length;
    const hasAvifTarget = state.jobs.some((j) => controller.resolveTarget(j) === 'avif');
    heavyWarn.hidden = !(convertible >= HEAVY_BATCH || hasAvifTarget);

    // Converting → Pause/Cancel; idle → Clear/[Reconvert all]/Convert.
    const pending = controller.pendingJobs().length;
    convertBtn.hidden = state.converting;
    clearBtn.hidden = state.converting;
    pauseBtn.hidden = !state.converting;
    cancelBtn.hidden = !state.converting;
    pauseBtn.textContent = state.paused ? 'Resume' : 'Pause';

    // Convert does only pending (new/changed) files; show the count when some are
    // already done so it's clear it won't redo them. Reconvert-all forces a redo.
    convertBtn.disabled = pending === 0;
    convertBtn.textContent = done > 0 && pending > 0 ? `Convert ${pending} new` : 'Convert';
    reconvertBtn.hidden = state.converting || done === 0;
    zipBtn.hidden = done < 2;
  }

  return controller;
}

function describe(
  total: number,
  done: number,
  errors: number,
  origBytes: number,
  outBytes: number,
): string {
  const parts = [`${total} file${total === 1 ? '' : 's'}`];
  if (done) parts.push(`${done} done`);
  if (errors) parts.push(`${errors} failed`);
  if (done && origBytes > 0) {
    const d = 1 - outBytes / origBytes;
    const pct = d >= 0 ? `−${Math.round(d * 100)}%` : `+${Math.round(-d * 100)}%`;
    parts.push(`${formatBytes(origBytes)} → ${formatBytes(outBytes)} (${pct})`);
  }
  return parts.join(' · ');
}
