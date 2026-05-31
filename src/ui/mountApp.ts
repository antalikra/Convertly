import { Controller, type AppState } from '@app/controller';
import { LOSSY_FORMATS, inputCategory, type Category } from '@core/types';
import type { ThemeMode } from '@infra/settings';
import { formatBytes } from '@shared/format';
import { createDropzone, type DropzoneView } from './components/Dropzone';
import { createOptionsPanel } from './components/OptionsPanel';
import { createFileList } from './components/FileList';
import { createResultPanel } from './components/ResultPanel';
import type { Job } from '@app/controller';
import './styles/app.css';

/** Show the CPU-freeze warning once a batch is at least this many files (AVIF
 *  warns at any count — its encoder is multi-threaded). */
const HEAVY_BATCH = 10;

/** Top-level tabs. View filter only: tabs change what's shown; Convert / ZIP /
 *  Clear still act on ALL files at once (the controller stays tab-agnostic). */
type Tab = 'media' | 'pdf';

/** Document with the (still-not-in-lib.dom) View Transitions API, used for the
 *  theme crossfade. Optional so we can feature-detect and fall back. */
type DocumentWithViewTransition = Document & {
  startViewTransition?: (callback: () => void | Promise<void>) => { finished: Promise<void> };
};
const TAB_OF_CATEGORY: Record<Category, Tab> = {
  image: 'media',
  audio: 'media',
  document: 'pdf',
};
const TAB_LABEL: Record<Tab, string> = { media: 'Media', pdf: 'Documents' };
const DROPZONE_VIEW: Record<Tab, DropzoneView> = {
  media: {
    title: 'Drop files here',
    sub: 'Images: HEIC, HEIF, JPG, PNG, WebP, GIF, BMP, AVIF, TIFF, SVG · Audio: MP3, WAV, FLAC, M4A, AAC, OGG',
    accept: 'image/*,audio/*,.heic,.heif,.avif,.tif,.tiff,.svg,.m4a,.flac',
  },
  pdf: {
    title: 'Drop PDF or DOCX files here',
    sub: 'PDF · rotate / split / merge / to image / to text / to DOCX · DOCX → PDF (Beta)',
    accept:
      'application/pdf,.pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  },
};

/** Which tab a job belongs to (unsupported files fall under Media). */
function tabOfJob(job: Job): Tab {
  const c = inputCategory(job.input);
  return c ? TAB_OF_CATEGORY[c] : 'media';
}

/** Slide a `.seg__pill` to cover the active button (same trick as OptionsPanel). */
function syncSegPill(seg: HTMLElement): void {
  const active = seg.querySelector<HTMLElement>('.seg__btn--active');
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

  // Active workspace tab. Declared early so option handlers can read it.
  let activeTab: Tab = 'media';

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
        <div class="tabs" data-tabs>
          <div class="seg seg--tabs" data-tabseg role="tablist" aria-label="Workspace">
            <span class="seg__pill no-anim"></span>
            <button class="seg__btn" type="button" role="tab" data-tab="media">Media</button>
            <button class="seg__btn" type="button" role="tab" data-tab="pdf">Documents</button>
          </div>
        </div>
        <div class="notice" data-notice hidden></div>
        <div data-slot="dropzone"></div>
        <div data-slot="options"></div>
        <div data-slot="list"></div>
        <div data-slot="result"></div>
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
    onResizeMode: (mode) =>
      void controller.updateSettings({ resizeMode: mode as 'percent' | 'maxside' }),
    onResizeMax: (resizeMaxPx) => void controller.updateSettings({ resizeMaxPx }),
    onTrimStart: (audioTrimStart) => void controller.updateSettings({ audioTrimStart }),
    onTrimEnd: (audioTrimEnd) => void controller.updateSettings({ audioTrimEnd }),
    onAudioMono: (audioMono) => void controller.updateSettings({ audioMono }),
    onAudioNormalize: (audioNormalize) => void controller.updateSettings({ audioNormalize }),
    onAudioBitrate: (audioBitrate) => void controller.updateSettings({ audioBitrate }),
    onOperation: (op) =>
      void controller.updateSettings({
        pdfOperation: op as 'rotate' | 'split' | 'merge' | 'tojpg' | 'topng' | 'totext' | 'todocx' | 'compress',
      }),
    onDocxOperation: (op) =>
      void controller.updateSettings({ docxOperation: op as 'topdf' | 'totext' | 'tohtml' }),
    onRotate: (pdfRotateAngle) => void controller.updateSettings({ pdfRotateAngle }),
    onCombine: (mode) => controller.setGroupMode(activeTab === 'pdf' ? 'document' : 'image', mode),
    onPdfPageSize: (size) =>
      void controller.updateSettings({ pdfPageSize: size as 'fit' | 'a4' | 'letter' }),
    onPdfOrientation: (o) =>
      void controller.updateSettings({ pdfOrientation: o as 'auto' | 'portrait' | 'landscape' }),
    onPdfMargin: (pdfMargin) => void controller.updateSettings({ pdfMargin }),
    onScale: (pdfImageScale) => void controller.updateSettings({ pdfImageScale }),
    onPageRange: (pdfPageRange) => void controller.updateSettings({ pdfPageRange }),
    onStampText: (stampText) => void controller.updateSettings({ stampText }),
    onStampPosition: (p) =>
      void controller.updateSettings({ stampPosition: p as 'center' | 'footer' }),
    onStampPageNumbers: (stampPageNumbers) => void controller.updateSettings({ stampPageNumbers }),
    onDocxMode: (docxMode) => void controller.updateSettings({ docxMode }),
  });
  const fileList = createFileList({
    onRemove: (id) => controller.removeJob(id),
    onDownload: (id) => controller.downloadOne(id),
    onFormat: (id, format) => controller.setJobFormat(id, format),
    onOperation: (id, op) => controller.setJobOperation(id, op),
    onDownloadOutput: (id, index) => controller.downloadOutput(id, index),
    onGroup: (id, group) => controller.setJobGroup(id, group),
    onNewGroup: (id) => controller.addJobToNewGroup(id),
    onReorder: (draggedId, targetId) => controller.moveJob(draggedId, targetId),
  });
  const resultPanel = createResultPanel((id) => controller.downloadAggregate(id));

  root.querySelector('[data-slot="dropzone"]')!.appendChild(dropzone.el);
  root.querySelector('[data-slot="options"]')!.appendChild(options.el);
  root.querySelector('[data-slot="list"]')!.appendChild(fileList.el);
  root.querySelector('[data-slot="result"]')!.appendChild(resultPanel.el);

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
    // updateSettings emits synchronously → render flips `data-theme` before this
    // returns, so a sync swap is enough for the View Transition to snapshot the
    // new theme. The API GPU-crossfades the whole frame (blur/gradients/shadows
    // included) in one pass — smooth + in unison, no per-node repaint jank.
    const swap = () => void controller.updateSettings({ theme: next });
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const start = (document as DocumentWithViewTransition).startViewTransition;
    if (!reduce && typeof start === 'function') start.call(document, swap);
    else swap();
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

  // ---- Top-level tabs (Media / PDF). View filter only: switching changes what's
  // shown; Convert / ZIP / Clear stay global (see TAB_OF_CATEGORY). ----
  const tabSeg = root.querySelector<HTMLElement>('[data-tabseg]')!;
  for (const b of Array.from(tabSeg.querySelectorAll<HTMLButtonElement>('.seg__btn'))) {
    b.addEventListener('click', () => {
      const tab = b.dataset.tab as Tab;
      if (tab === activeTab) return;
      activeTab = tab;
      render(controller.getState());
    });
  }

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

    // Lock option/tab controls while converting (changing them mid-run no-ops).
    document.body.classList.toggle('is-busy', state.converting);

    // Per-tab buckets (view filter only; Convert still runs over every job).
    const tabJobs: Record<Tab, Job[]> = { media: [], pdf: [] };
    for (const job of state.jobs) tabJobs[tabOfJob(job)].push(job);
    const visible = tabJobs[activeTab];

    // Tab bar: active highlight, per-tab count, sliding pill.
    for (const b of Array.from(tabSeg.querySelectorAll<HTMLButtonElement>('.seg__btn'))) {
      const tab = b.dataset.tab as Tab;
      const n = tabJobs[tab].length;
      b.textContent = n > 0 ? `${TAB_LABEL[tab]} (${n})` : TAB_LABEL[tab];
      const active = tab === activeTab;
      b.classList.toggle('seg__btn--active', active);
      b.setAttribute('aria-selected', String(active));
    }
    syncSegPill(tabSeg);

    // Dropzone hint + picker filter follow the active tab.
    dropzone.update(DROPZONE_VIEW[activeTab]);

    // Empty state keys off the ACTIVE tab so its dropzone grows when it's empty.
    document.body.classList.toggle('is-empty', visible.length === 0);

    // Options show only the active tab's controls (Media = format rows +
    // quality/resize; PDF = rotate). present is global → filter to the tab.
    const present = controller.categoriesPresent();
    const rows = present
      .filter((category) => TAB_OF_CATEGORY[category] === activeTab && category !== 'document')
      .map((category) => ({
        category,
        available: controller.availableOutputFormats(category),
        selected: controller.targetFormat(category),
      }));
    const imageRow = rows.find((r) => r.category === 'image');
    const audioRow = rows.find((r) => r.category === 'audio');
    // Per-file document operations (incl. the global preset they fall back to)
    // drive which sub-controls show.
    const onDocsTab = activeTab === 'pdf';
    const docJobs = state.jobs.filter((j) => inputCategory(j.input) === 'document');
    const pdfJobs = docJobs.filter((j) => j.input.detectedFormat === 'pdf');
    const docxJobs = docJobs.filter((j) => j.input.detectedFormat === 'docx');
    const anyPdfOp = (op: string) => onDocsTab && pdfJobs.some((j) => controller.docOperation(j) === op);
    const anyDocxOp = (op: string) => onDocsTab && docxJobs.some((j) => controller.docOperation(j) === op);
    // Combine presets matter only when the active tab's target is an aggregate.
    const imagesToPdf = activeTab === 'media' && imageRow?.selected === 'pdf';
    const showCombine = imagesToPdf || anyPdfOp('merge');
    options.update({
      rows,
      quality: state.settings.quality,
      // Quality slider is for lossy IMAGE output; audio uses the Bitrate seg.
      showQuality: anyPdfOp('tojpg') || (imageRow != null && LOSSY_FORMATS.includes(imageRow.selected)),
      resize: state.settings.resize,
      // Resize applies to raster output, not the images→PDF combine.
      showResize: imageRow != null && imageRow.selected !== 'pdf',
      resizeMode: state.settings.resizeMode,
      resizeMaxPx: state.settings.resizeMaxPx,
      showAudio: activeTab === 'media' && audioRow != null,
      trimStart: state.settings.audioTrimStart,
      trimEnd: state.settings.audioTrimEnd,
      audioMono: state.settings.audioMono,
      audioNormalize: state.settings.audioNormalize,
      showAudioBitrate: activeTab === 'media' && audioRow?.selected === 'mp3',
      audioBitrate: state.settings.audioBitrate,
      // Global presets: shown whenever that kind of document is present.
      showPdfOps: onDocsTab && pdfJobs.length > 0,
      pdfOperation: state.settings.pdfOperation,
      mergeDisabled: pdfJobs.length < 2,
      showDocxOps: onDocsTab && docxJobs.length > 0,
      docxOperation: state.settings.docxOperation,
      showRotate: anyPdfOp('rotate'),
      rotateAngle: state.settings.pdfRotateAngle,
      showCombine,
      showImagesToPdf: imagesToPdf,
      pdfPageSize: state.settings.pdfPageSize,
      pdfOrientation: state.settings.pdfOrientation,
      pdfMargin: state.settings.pdfMargin,
      showScale: anyPdfOp('tojpg') || anyPdfOp('topng') || anyPdfOp('compress'),
      pdfScale: state.settings.pdfImageScale,
      showDocxMode: anyDocxOp('topdf'),
      docxMode: state.settings.docxMode,
      showDocxHint: anyPdfOp('todocx'),
      showCompressHint: anyPdfOp('compress'),
      showPages: anyPdfOp('pages'),
      pageRange: state.settings.pdfPageRange,
      showStamp: anyPdfOp('stamp'),
      stampText: state.settings.stampText,
      stampPosition: state.settings.stampPosition,
      stampPageNumbers: state.settings.stampPageNumbers,
    });

    fileList.update(
      visible.map((job) => {
        const category = inputCategory(job.input);
        const isAggregate = controller.isAggregateTarget(job);
        const isDoc = category === 'document';
        return {
          job,
          // Media files pick an output format; document files pick an operation.
          options: category && !isDoc ? controller.availableOutputFormats(category) : [],
          docOps: isDoc ? controller.docOperationsFor(job) : undefined,
          docOp: isDoc ? controller.docOperation(job) : undefined,
          target: controller.resolveTarget(job),
          isAggregate,
          group: isAggregate ? controller.groupOf(job) : undefined,
          groups: isAggregate && category ? controller.groupsFor(category) : undefined,
        };
      }),
    );

    // Combined (aggregate) results for the active tab's categories.
    const tabResults = present
      .filter((c) => TAB_OF_CATEGORY[c] === activeTab)
      .flatMap((c) => controller.aggregatesFor(c))
      .map((a) => ({
        id: a.id,
        fileName: a.output.fileName,
        sourceCount: a.sourceCount,
        sizeBytes: a.output.blob.size,
      }));
    resultPanel.update(tabResults);

    // A job is "done" if it produced its own file OR was folded into an aggregate.
    const isDone = (j: Job) => !!j.outputs?.length || !!j.aggregated;

    // When a conversion finishes (converting: true → false with ≥1 success),
    // pulse the support ♥ once — it's the moment the user just got their files.
    const doneCount = state.jobs.filter(isDone).length;
    if (wasConverting && !state.converting && doneCount > 0) {
      supportBtn.classList.remove('is-beating');
      void supportBtn.offsetWidth; // reflow so the animation restarts if mid-beat
      supportBtn.classList.add('is-beating');
    }
    wasConverting = state.converting;

    const hasJobs = state.jobs.length > 0;
    actions.hidden = !hasJobs;
    if (!hasJobs) return;

    const done = state.jobs.filter(isDone).length;
    const errors = state.jobs.filter((j) => j.error).length;
    const total = state.jobs.length;

    let origBytes = 0;
    let outBytes = 0;
    for (const j of state.jobs) {
      if (isDone(j)) origBytes += j.input.sizeBytes;
      for (const o of j.outputs ?? []) outBytes += o.blob.size;
    }
    for (const a of state.aggregates) outBytes += a.output.blob.size;

    summary.textContent = state.converting
      ? `${state.paused ? 'Paused' : 'Converting…'} ${done}/${total}`
      : describe(total, done, errors, origBytes, outBytes, controller.outputCount());

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
    // ZIP makes sense once there are ≥2 output files (one split job can suffice).
    zipBtn.hidden = controller.outputCount() < 2;
  }

  return controller;
}

function describe(
  total: number,
  done: number,
  errors: number,
  origBytes: number,
  outBytes: number,
  outFiles: number,
): string {
  const parts = [`${total} file${total === 1 ? '' : 's'}`];
  if (done) parts.push(`${done} done`);
  if (errors) parts.push(`${errors} failed`);
  // When a job fans out (PDF split), the output count differs from the input
  // count — show it so "1 file" doesn't hide the 106 pages produced.
  if (outFiles > done) parts.push(`${outFiles} files out`);
  if (done && origBytes > 0) {
    const d = 1 - outBytes / origBytes;
    const pct = d >= 0 ? `−${Math.round(d * 100)}%` : `+${Math.round(-d * 100)}%`;
    parts.push(`${formatBytes(origBytes)} → ${formatBytes(outBytes)} (${pct})`);
  }
  return parts.join(' · ');
}
