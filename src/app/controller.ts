import { buildRegistry } from '@core/registerTools';
import {
  OUTPUT_ORDER,
  CATEGORY_ORDER,
  inputCategory,
  type Category,
  type FormatId,
  type InputFile,
  type OutputFile,
  type ProgressEvent,
  type ProgressStage,
  type Tool,
  type ToolOptions,
} from '@core/types';
import { toInputFile } from '@infra/fileRead';
import { downloadBlob, downloadZip } from '@infra/download';
import { loadSettings, saveSettings, DEFAULT_SETTINGS, type Settings } from '@infra/settings';
import { JobQueue, type JobResult, type ConvertTask } from './JobQueue';

/** Max files converted in parallel. Capped to bound peak memory on big batches. */
const CONCURRENCY = 4;

/** Max files queued at once — keeps the list/DOM manageable. */
const MAX_FILES = 200;

/** Per-file operation choices for the document row dropdowns (id → label). */
export const PDF_OPS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'rotate', label: 'Rotate' },
  { id: 'split', label: 'Split pages' },
  { id: 'merge', label: 'Merge' },
  { id: 'tojpg', label: 'To JPG' },
  { id: 'topng', label: 'To PNG' },
  { id: 'totext', label: 'To text' },
  { id: 'todocx', label: 'To DOCX' },
  { id: 'compress', label: 'Compress' },
  { id: 'pages', label: 'Pages' },
  { id: 'stamp', label: 'Stamp' },
];
export const DOCX_OPS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'topdf', label: 'To PDF' },
  { id: 'totext', label: 'To text' },
  { id: 'tohtml', label: 'To HTML' },
];

/** Resolve a document operation to its output format. */
function docTarget(input: InputFile, op: string): FormatId {
  if (input.detectedFormat === 'docx') {
    if (op === 'totext') return 'txt';
    if (op === 'tohtml') return 'html';
    return 'pdf';
  }
  if (op === 'tojpg') return 'jpeg';
  if (op === 'topng') return 'png';
  if (op === 'totext') return 'txt';
  if (op === 'todocx') return 'docx';
  return 'pdf'; // rotate / split / merge
}

export interface Job {
  input: InputFile;
  stage: ProgressStage;
  /** Files produced. Usually one (1→1); many for 1→N tools like PDF split. */
  outputs?: OutputFile[];
  error?: string;
  /** Per-file output override; falls back to the category's target format. */
  targetFormat?: FormatId;
  /** Per-file document operation (rotate / split / to JPG / …). Falls back to the
   *  category default in settings. */
  docOp?: string;
  /** Aggregate group number (merge / images→PDF). Files sharing a group combine
   *  into one file. Undefined = group 1 (all-in-one default). */
  group?: number;
  /** True when this input was folded into an aggregate result (merge / images→PDF)
   *  instead of producing its own file. Keeps it out of `pendingJobs`. */
  aggregated?: boolean;
}

/** A single combined file produced by an aggregate tool from many inputs. */
export interface AggregateResult {
  /** Stable per tool+group (e.g. 'agg-pdf-merge-1') so a re-run replaces it. */
  id: string;
  category: Category;
  /** Group number this result was built from. */
  group: number;
  output: OutputFile;
  /** How many inputs were combined. */
  sourceCount: number;
}

export interface AppState {
  jobs: Job[];
  /** Combined files from aggregate tools (merge / images→PDF), shown as result rows. */
  aggregates: AggregateResult[];
  settings: Settings;
  converting: boolean;
  /** True while a running batch is paused (no new files start; in-flight finishes). */
  paused: boolean;
  /** Transient message (e.g. file-limit hit); shown then cleared on next add/clear. */
  notice?: string;
}

/** Cooperative cancel/pause shared with the JobQueue worker pool. */
interface RunControl {
  cancelled: boolean;
  paused: boolean;
  /** Resolver for the gate the pool awaits while paused; set by waitIfPaused. */
  resume: (() => void) | null;
}

type Listener = (state: AppState) => void;

/**
 * Orchestration layer. Owns app state, talks to the registry/queue, and pushes
 * immutable-ish state snapshots to the UI. The UI never touches core/infra
 * directly (Golden rule #3).
 */
export class Controller {
  private readonly registry = buildRegistry();
  private readonly queue = new JobQueue(this.registry);
  private readonly listeners = new Set<Listener>();

  private state: AppState = {
    jobs: [],
    aggregates: [],
    settings: { ...DEFAULT_SETTINGS },
    converting: false,
    paused: false,
  };

  /** Live control for the in-flight batch (cancel/pause). Reset per convertAll. */
  private control: RunControl = { cancelled: false, paused: false, resume: null };

  async init(): Promise<void> {
    this.state.settings = await loadSettings();
    this.emit();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  getState(): AppState {
    return this.state;
  }

  async addFiles(files: File[]): Promise<void> {
    const room = MAX_FILES - this.state.jobs.length;
    const accepted = files.length > room ? files.slice(0, Math.max(0, room)) : files;
    const notice =
      accepted.length < files.length
        ? `Limit is ${MAX_FILES} files — skipped ${files.length - accepted.length}.`
        : undefined;

    const inputs = await Promise.all(accepted.map(toInputFile));
    const jobs: Job[] = inputs.map((input) => ({ input, stage: 'queued' }));
    // New files change what an aggregate would combine — but only for THEIR
    // category (adding an image must not reset a PDF merge).
    this.dropAggregates(this.categoriesOf(inputs));
    this.state = { ...this.state, jobs: [...this.state.jobs, ...jobs], notice };
    this.ensureValidOutput();
    this.emit();
  }

  removeJob(id: string): void {
    // Removing a file changes its category's aggregate (one fewer page to combine).
    const removed = this.state.jobs.find((j) => j.input.id === id);
    if (removed) this.dropAggregates(this.categoriesOf([removed.input]));
    this.state = { ...this.state, jobs: this.state.jobs.filter((j) => j.input.id !== id) };
    this.ensureValidOutput();
    this.emit();
  }

  clear(): void {
    this.state = { ...this.state, jobs: [], aggregates: [], notice: undefined };
    this.emit();
  }

  /** Categories present among current inputs, in canonical order (image, audio). */
  categoriesPresent(): Category[] {
    const present = new Set<Category>();
    for (const j of this.state.jobs) {
      const c = inputCategory(j.input);
      if (c) present.add(c);
    }
    return CATEGORY_ORDER.filter((c) => present.has(c));
  }

  /**
   * Output formats reachable for the inputs of ONE category — the intersection
   * of what those files' matching tools can produce, in canonical order.
   */
  availableOutputFormats(category: Category): FormatId[] {
    const jobs = this.state.jobs.filter((j) => inputCategory(j.input) === category);
    if (jobs.length === 0) return [];

    let acc: Set<FormatId> | null = null;
    for (const job of jobs) {
      const outs = new Set<FormatId>();
      for (const tool of this.registry.all()) {
        if (tool.accepts(job.input)) {
          for (const f of tool.outputFormats) outs.add(f);
        }
      }
      if (acc === null) {
        acc = outs;
      } else {
        const next = new Set<FormatId>();
        for (const f of acc) if (outs.has(f)) next.add(f);
        acc = next;
      }
    }
    const reachable = acc ?? new Set<FormatId>();
    return OUTPUT_ORDER.filter((f) => reachable.has(f));
  }

  /** The chosen target format for a category. For documents the PDF operation
   *  decides the output: rotate/split/merge stay PDF, "to JPG/PNG" rasterise. */
  targetFormat(category: Category): FormatId {
    if (category === 'document') {
      const op = this.state.settings.pdfOperation;
      if (op === 'tojpg') return 'jpeg';
      if (op === 'topng') return 'png';
      if (op === 'totext') return 'txt';
      if (op === 'todocx') return 'docx';
      return 'pdf';
    }
    return category === 'audio'
      ? this.state.settings.audioFormat
      : this.state.settings.imageFormat;
  }

  /** Resolved target for one job: its per-file override, else the category target. */
  resolveTarget(job: Job): FormatId | null {
    const c = inputCategory(job.input);
    if (!c) return null;
    // Documents are driven by a per-file operation (→ PDF / image / text / …).
    if (c === 'document') return docTarget(job.input, this.docOperation(job));
    return job.targetFormat ?? this.targetFormat(c);
  }

  /** The operation for a document job: its per-file override, else the category
   *  default from settings (pdf → rotate, docx → to PDF). */
  docOperation(job: Job): string {
    if (job.docOp) return job.docOp;
    return job.input.detectedFormat === 'docx'
      ? this.state.settings.docxOperation
      : this.state.settings.pdfOperation;
  }

  /** Operation choices for a document row's per-file dropdown ([] for non-docs). */
  docOperationsFor(job: Job): ReadonlyArray<{ id: string; label: string }> {
    if (job.input.detectedFormat === 'docx') return DOCX_OPS;
    if (job.input.detectedFormat === 'pdf') return PDF_OPS;
    return [];
  }

  /** Set a document job's operation; drops its output + any aggregate it joined. */
  setJobOperation(id: string, op: string): void {
    const job = this.state.jobs.find((j) => j.input.id === id);
    if (!job) return;
    this.dropAggregates(this.categoriesOf([job.input]));
    this.state = {
      ...this.state,
      jobs: this.state.jobs.map((j) =>
        j.input.id === id
          ? { ...j, docOp: op, outputs: undefined, error: undefined, aggregated: false, stage: 'queued' }
          : j,
      ),
    };
    this.emit();
  }

  /** Set a per-file output format override. */
  setJobFormat(id: string, format: FormatId): void {
    // Changing a target can move a file in/out of its category's aggregate.
    const job = this.state.jobs.find((j) => j.input.id === id);
    if (job) this.dropAggregates(this.categoriesOf([job.input]));
    this.state = {
      ...this.state,
      jobs: this.state.jobs.map((j) => (j.input.id === id ? { ...j, targetFormat: format } : j)),
    };
    this.emit();
  }

  /** Drop aggregate results and clear the `aggregated` flag on member jobs for the
   *  given categories (all categories when omitted). Called when the selection or
   *  a target/operation changes — the prior combined file no longer reflects the
   *  current inputs. Scoped by category so e.g. adding an image doesn't reset a PDF
   *  merge. */
  /** Distinct categories present among the given inputs. */
  private categoriesOf(inputs: InputFile[]): Set<Category> {
    const set = new Set<Category>();
    for (const i of inputs) {
      const c = inputCategory(i);
      if (c) set.add(c);
    }
    return set;
  }

  private dropAggregates(categories?: ReadonlySet<Category>): void {
    const hits = (c: Category) => categories === undefined || categories.has(c);
    const jobHit = (j: Job) => {
      const c = inputCategory(j.input);
      return c != null && hits(c);
    };
    const hadResults = this.state.aggregates.some((a) => hits(a.category));
    const hadFlags = this.state.jobs.some((j) => j.aggregated && jobHit(j));
    if (!hadResults && !hadFlags) return;
    this.state = {
      ...this.state,
      aggregates: this.state.aggregates.filter((a) => !hits(a.category)),
      jobs: this.state.jobs.map((j) =>
        j.aggregated && jobHit(j)
          ? { ...j, aggregated: false, stage: j.outputs?.length ? 'done' : 'queued' }
          : j,
      ),
    };
  }

  /** If a category's chosen output is no longer valid for its inputs, fix it. */
  private ensureValidOutput(): void {
    let settings = this.state.settings;
    for (const cat of this.categoriesPresent()) {
      if (cat === 'document') continue; // PDF target is fixed ('pdf'), nothing to reconcile
      const available = this.availableOutputFormats(cat);
      const key = cat === 'audio' ? 'audioFormat' : 'imageFormat';
      if (available.length > 0 && !available.includes(settings[key])) {
        settings = { ...settings, [key]: available[0] };
      }
    }
    if (settings !== this.state.settings) this.state = { ...this.state, settings };
  }

  async updateSettings(patch: Partial<Settings>): Promise<void> {
    const prev = this.state.settings;
    let jobs = this.state.jobs;
    let aggregates = this.state.aggregates;

    // The PDF operation + rotate angle aren't part of the output *format*, so
    // isUpToDate() can't see them change. Re-running needs an explicit
    // invalidate: drop the outputs of document jobs so they become pending again
    // (like a format swap does for images via resolveTarget).
    const pdfChanged =
      (patch.pdfOperation !== undefined && patch.pdfOperation !== prev.pdfOperation) ||
      (patch.pdfRotateAngle !== undefined && patch.pdfRotateAngle !== prev.pdfRotateAngle) ||
      (patch.pdfImageScale !== undefined && patch.pdfImageScale !== prev.pdfImageScale) ||
      (patch.docxMode !== undefined && patch.docxMode !== prev.docxMode) ||
      (patch.docxOperation !== undefined && patch.docxOperation !== prev.docxOperation);
    if (pdfChanged) {
      jobs = jobs.map((j) =>
        inputCategory(j.input) === 'document' && (j.outputs?.length || j.error)
          ? { ...j, outputs: undefined, error: undefined, stage: 'queued' }
          : j,
      );
    }

    // A changed operation (e.g. → merge) or image target (→ PDF) changes whether
    // files aggregate, so the affected category's prior result is stale: clear it
    // and the per-job `aggregated` flag — scoped so a PDF op change doesn't drop an
    // image result and vice-versa.
    const imageChanged = patch.imageFormat !== undefined && patch.imageFormat !== prev.imageFormat;
    const affected = new Set<Category>();
    if (pdfChanged) affected.add('document');
    if (imageChanged) affected.add('image');
    if (affected.size > 0) {
      aggregates = aggregates.filter((a) => !affected.has(a.category));
      jobs = jobs.map((j) => {
        const c = inputCategory(j.input);
        return j.aggregated && c != null && affected.has(c)
          ? { ...j, aggregated: false, stage: j.outputs?.length ? 'done' : 'queued' }
          : j;
      });
    }

    this.state = { ...this.state, settings: { ...prev, ...patch }, jobs, aggregates };
    this.emit();
    await saveSettings(this.state.settings);
  }

  /** Inputs this build can convert to their resolved target format. */
  convertibleJobs(): Job[] {
    return this.state.jobs.filter((j) => {
      const target = this.resolveTarget(j);
      return target != null && this.registry.findForConversion(j.input, target).length > 0;
    });
  }

  /** A job is up-to-date when its output exists AND matches the current target
   *  (so changing a file's format marks it pending again), or it was folded into
   *  a current aggregate result. */
  private isUpToDate(job: Job): boolean {
    if (job.aggregated) return true;
    const outs = job.outputs;
    return outs != null && outs.length > 0 && outs[0].format === this.resolveTarget(job);
  }

  /** Build the ToolOptions for a job from current settings. */
  private optionsFor(job: Job): ToolOptions {
    return {
      outputFormat: this.resolveTarget(job) as FormatId,
      quality: this.state.settings.quality,
      resize: this.state.settings.resize,
      resizeMode: this.state.settings.resizeMode,
      resizeMaxPx: this.state.settings.resizeMaxPx,
      // Document-only; ignored by image/audio tools. Selects rotate/split/merge/…
      operation: this.docOperation(job),
      rotateAngle: this.state.settings.pdfRotateAngle,
      scale: this.state.settings.pdfImageScale,
      docxMode: this.state.settings.docxMode,
      pdfPageSize: this.state.settings.pdfPageSize,
      pdfOrientation: this.state.settings.pdfOrientation,
      pdfMargin: this.state.settings.pdfMargin,
      pageRange: this.state.settings.pdfPageRange,
      stampText: this.state.settings.stampText,
      stampPosition: this.state.settings.stampPosition,
      stampPageNumbers: this.state.settings.stampPageNumbers,
      trimStart: this.state.settings.audioTrimStart,
      trimEnd: this.state.settings.audioTrimEnd,
      audioMono: this.state.settings.audioMono,
      normalize: this.state.settings.audioNormalize,
      audioBitrate: this.state.settings.audioBitrate,
    };
  }

  /** The tool that would run for a job (operation-aware). */
  private toolFor(job: Job): Tool | undefined {
    const target = this.resolveTarget(job);
    if (!target) return undefined;
    return this.registry.resolve(job.input, target, this.docOperation(job));
  }

  /** Reorder: move `draggedId` to sit just before `targetId` in the job list.
   *  The list order is the order aggregate tools (merge / images→PDF) combine
   *  files in, so this lets the user control e.g. the merged page order. */
  moveJob(draggedId: string, targetId: string | null): void {
    if (draggedId === targetId) return;
    const dragged = this.state.jobs.find((j) => j.input.id === draggedId);
    if (!dragged) return;
    const cat = inputCategory(dragged.input);
    const rest = this.state.jobs.filter((j) => j.input.id !== draggedId);

    let insertAt: number;
    if (targetId == null) {
      // Move to the end of its own category (after the last same-category job).
      insertAt = rest.length;
      for (let i = rest.length - 1; i >= 0; i--) {
        if (inputCategory(rest[i].input) === cat) {
          insertAt = i + 1;
          break;
        }
      }
    } else {
      const target = rest.find((j) => j.input.id === targetId);
      // Reorder only within a category (the list is bucketed per category on screen).
      if (!target || inputCategory(target.input) !== cat) return;
      insertAt = rest.findIndex((j) => j.input.id === targetId);
    }
    rest.splice(insertAt, 0, dragged);
    // A new order means any combined file is stale.
    this.dropAggregates(this.categoriesOf([dragged.input]));
    this.state = { ...this.state, jobs: rest };
    this.emit();
  }

  /** Aggregate group of a job (default 1 = all-in-one). */
  groupOf(job: Job): number {
    return job.group ?? 1;
  }

  /** Whether a job's resolved target is an aggregate tool (merge / images→PDF) —
   *  i.e. it participates in grouping. */
  isAggregateTarget(job: Job): boolean {
    return this.toolFor(job)?.aggregate === true;
  }

  /** Distinct groups in use among a category's aggregate-target jobs (sorted). */
  groupsFor(category: Category): number[] {
    const set = new Set<number>();
    for (const j of this.state.jobs) {
      if (inputCategory(j.input) === category && this.isAggregateTarget(j)) set.add(this.groupOf(j));
    }
    return [...set].sort((a, b) => a - b);
  }

  /** Move a job to a group; invalidates that category's aggregate results. */
  setJobGroup(id: string, group: number): void {
    const job = this.state.jobs.find((j) => j.input.id === id);
    if (!job) return;
    this.dropAggregates(this.categoriesOf([job.input]));
    this.state = {
      ...this.state,
      jobs: this.state.jobs.map((j) => (j.input.id === id ? { ...j, group } : j)),
    };
    this.emit();
  }

  /** Put a job into a brand-new group (max group + 1 for its category). */
  addJobToNewGroup(id: string): void {
    const job = this.state.jobs.find((j) => j.input.id === id);
    const c = job ? inputCategory(job.input) : null;
    if (!c) return;
    this.setJobGroup(id, Math.max(0, ...this.groupsFor(c)) + 1);
  }

  /** Preset: 'one' = all of a category's aggregate files in group 1; 'separate' =
   *  each its own group (1..N in list order). */
  setGroupMode(category: Category, mode: 'one' | 'separate'): void {
    this.dropAggregates(new Set([category]));
    let n = 0;
    this.state = {
      ...this.state,
      jobs: this.state.jobs.map((j) => {
        if (inputCategory(j.input) !== category || !this.isAggregateTarget(j)) return j;
        n += 1;
        return { ...j, group: mode === 'one' ? 1 : n };
      }),
    };
    this.emit();
  }

  /** "images.pdf" + group 2 → "images-2.pdf". */
  private withGroupSuffix(fileName: string, group: number): string {
    const dot = fileName.lastIndexOf('.');
    const base = dot === -1 ? fileName : fileName.slice(0, dot);
    const ext = dot === -1 ? '' : fileName.slice(dot);
    return `${base}-${group}${ext}`;
  }

  /** Convertible jobs that still need work: never converted, or their target
   *  changed since (so a re-add + Convert only does the new/changed files). */
  pendingJobs(): Job[] {
    return this.convertibleJobs().filter((j) => !this.isUpToDate(j));
  }

  /**
   * Convert files to their resolved target (per-file override else category
   * default), several at once via a bounded pool (PLAN §2.5: a cap keeps a big
   * batch of heavy decoders from exhausting memory).
   *
   * Default converts only **pending** files (skips already-done ones, e.g. after
   * adding more files to a finished batch). `force` re-runs every convertible
   * file ("Reconvert all").
   */
  async convertAll(force = false): Promise<void> {
    if (this.state.converting) return;

    // Partition convertible jobs by their resolved tool. Aggregate tools (merge /
    // images→PDF) take ALL their matching inputs at once; everything else runs
    // one input at a time through the bounded pool.
    // Key aggregate work by tool + group, so each group yields its own file.
    const aggregateGroups = new Map<string, { tool: Tool; group: number; jobs: Job[] }>();
    const normalJobs: Job[] = [];
    for (const j of this.convertibleJobs()) {
      const tool = this.toolFor(j);
      if (tool?.aggregate) {
        const group = this.groupOf(j);
        const key = `${tool.id}:${group}`;
        const g = aggregateGroups.get(key) ?? { tool, group, jobs: [] };
        g.jobs.push(j);
        aggregateGroups.set(key, g);
      } else {
        normalJobs.push(j);
      }
    }
    // How many groups each tool has → only suffix file names when >1 group.
    const groupsPerTool = new Map<string, Set<number>>();
    for (const g of aggregateGroups.values()) {
      (groupsPerTool.get(g.tool.id) ?? groupsPerTool.set(g.tool.id, new Set()).get(g.tool.id)!).add(
        g.group,
      );
    }

    const normalTargets = force ? normalJobs : normalJobs.filter((j) => !this.isUpToDate(j));
    // A group is dirty when forced or any member hasn't been folded in yet.
    const dirtyGroups = [...aggregateGroups.values()].filter(
      (g) => force || g.jobs.some((j) => !j.aggregated),
    );
    if (normalTargets.length === 0 && dirtyGroups.length === 0) return;

    this.control = { cancelled: false, paused: false, resume: null };
    this.state = { ...this.state, converting: true, paused: false };

    const resetIds = [
      ...normalTargets.map((j) => j.input.id),
      ...dirtyGroups.flatMap((g) => g.jobs.map((j) => j.input.id)),
    ];
    this.patchJobs(resetIds, {
      stage: 'queued',
      error: undefined,
      outputs: undefined,
      aggregated: false,
    });

    const onProgress = (e: ProgressEvent) =>
      this.patchJobs([e.inputId], {
        stage: e.stage,
        ...(e.stage === 'error' ? { error: e.message } : {}),
      });

    const control = {
      isCancelled: () => this.control.cancelled,
      waitIfPaused: async () => {
        while (this.control.paused && !this.control.cancelled) {
          await new Promise<void>((res) => (this.control.resume = res));
        }
      },
    };

    try {
      // 1) Per-input tools through the bounded pool.
      if (normalTargets.length > 0) {
        const tasks: ConvertTask[] = normalTargets.map((j) => ({
          input: j.input,
          options: this.optionsFor(j),
        }));
        const results = await this.queue.run(tasks, onProgress, CONCURRENCY, control);
        const byId = new Map<string, JobResult>(
          results.filter((r): r is JobResult => r != null).map((r) => [r.inputId, r]),
        );
        this.state = {
          ...this.state,
          jobs: this.state.jobs.map((j) => {
            const r = byId.get(j.input.id);
            return r ? { ...j, outputs: r.outputs, error: r.error } : j;
          }),
        };
      }

      // 2) Aggregate tools: one combined file per dirty group → an AggregateResult.
      for (const g of dirtyGroups) {
        if (this.control.cancelled) break;
        const inputs = g.jobs.map((j) => j.input);
        const category = inputCategory(inputs[0]);
        const outs = await g.tool.run(inputs, this.optionsFor(g.jobs[0]), onProgress);
        if (outs[0] && category) {
          const multiGroup = (groupsPerTool.get(g.tool.id)?.size ?? 1) > 1;
          const fileName = multiGroup
            ? this.withGroupSuffix(outs[0].fileName, g.group)
            : outs[0].fileName;
          const result: AggregateResult = {
            id: `agg-${g.tool.id}-${g.group}`,
            category,
            group: g.group,
            output: { ...outs[0], fileName },
            sourceCount: inputs.length,
          };
          this.state = {
            ...this.state,
            aggregates: [...this.state.aggregates.filter((a) => a.id !== result.id), result],
          };
          // Members are folded in: done, no individual file (the result holds it).
          this.patchJobs(inputs.map((i) => i.id), {
            stage: 'done',
            aggregated: true,
            error: undefined,
            outputs: undefined,
          });
        }
      }
    } finally {
      // Always clear the flags — an unexpected throw out of the queue must not
      // leave the UI stuck in "Converting…".
      this.state = { ...this.state, converting: false, paused: false };
      this.emit();
    }
  }

  /** Stop the running batch: no new files start; the in-flight one finishes,
   *  the rest stay 'queued' so the user can Convert again later. */
  cancelConversion(): void {
    if (!this.state.converting) return;
    this.control.cancelled = true;
    this.control.resume?.(); // release the pause gate so the pool can exit
    this.control.resume = null;
  }

  /** Pause/resume between files (the in-flight file always finishes). */
  togglePause(): void {
    if (!this.state.converting) return;
    this.control.paused = !this.control.paused;
    if (!this.control.paused) {
      this.control.resume?.();
      this.control.resume = null;
    }
    this.state = { ...this.state, paused: this.control.paused };
    this.emit();
  }

  doneOutputs(): OutputFile[] {
    return [
      ...this.state.jobs.flatMap((j) => j.outputs ?? []),
      ...this.state.aggregates.map((a) => a.output),
    ];
  }

  /** Total files produced (a split job contributes one per page; each aggregate
   *  result is one file). */
  outputCount(): number {
    return (
      this.state.jobs.reduce((n, j) => n + (j.outputs?.length ?? 0), 0) +
      this.state.aggregates.length
    );
  }

  /** Aggregate results (combined files) for one category — drives the result card. */
  aggregatesFor(category: Category): AggregateResult[] {
    return this.state.aggregates.filter((a) => a.category === category);
  }

  downloadAggregate(id: string): void {
    const a = this.state.aggregates.find((x) => x.id === id);
    if (a) downloadBlob(a.output.blob, a.output.fileName);
  }

  /** Download one specific output file of a job (a single split page). */
  downloadOutput(id: string, index: number): void {
    const out = this.state.jobs.find((j) => j.input.id === id)?.outputs?.[index];
    if (out) downloadBlob(out.blob, out.fileName);
  }

  /** Download a job's result: one file directly, many (split) as a ZIP. */
  downloadOne(id: string): void {
    const job = this.state.jobs.find((j) => j.input.id === id);
    const outs = job?.outputs;
    if (!outs || outs.length === 0) return;
    if (outs.length === 1) {
      downloadBlob(outs[0].blob, outs[0].fileName);
    } else {
      const dot = job!.input.name.lastIndexOf('.');
      const base = dot === -1 ? job!.input.name : job!.input.name.slice(0, dot);
      void downloadZip(outs, `${base}.zip`);
    }
  }

  async downloadAllZip(): Promise<void> {
    const outputs = this.doneOutputs();
    if (outputs.length > 0) await downloadZip(outputs);
  }

  private patchJobs(ids: string[], patch: Partial<Job>): void {
    const set = new Set(ids);
    this.state = {
      ...this.state,
      jobs: this.state.jobs.map((j) => (set.has(j.input.id) ? { ...j, ...patch } : j)),
    };
    this.emit();
  }

  private emit(): void {
    for (const l of this.listeners) l(this.state);
  }
}
