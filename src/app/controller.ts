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
} from '@core/types';
import { toInputFile } from '@infra/fileRead';
import { downloadBlob, downloadZip } from '@infra/download';
import { loadSettings, saveSettings, DEFAULT_SETTINGS, type Settings } from '@infra/settings';
import { JobQueue, type JobResult, type ConvertTask } from './JobQueue';

/** Max files converted in parallel. Capped to bound peak memory on big batches. */
const CONCURRENCY = 4;

/** Max files queued at once — keeps the list/DOM manageable. */
const MAX_FILES = 200;

export interface Job {
  input: InputFile;
  stage: ProgressStage;
  output?: OutputFile;
  error?: string;
  /** Per-file output override; falls back to the category's target format. */
  targetFormat?: FormatId;
}

export interface AppState {
  jobs: Job[];
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
    this.state = { ...this.state, jobs: [...this.state.jobs, ...jobs], notice };
    this.ensureValidOutput();
    this.emit();
  }

  removeJob(id: string): void {
    this.state = { ...this.state, jobs: this.state.jobs.filter((j) => j.input.id !== id) };
    this.ensureValidOutput();
    this.emit();
  }

  clear(): void {
    this.state = { ...this.state, jobs: [], notice: undefined };
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

  /** The chosen target format for a category. */
  targetFormat(category: Category): FormatId {
    return category === 'audio'
      ? this.state.settings.audioFormat
      : this.state.settings.imageFormat;
  }

  /** Resolved target for one job: its per-file override, else the category target. */
  resolveTarget(job: Job): FormatId | null {
    const c = inputCategory(job.input);
    if (!c) return null;
    return job.targetFormat ?? this.targetFormat(c);
  }

  /** Set a per-file output format override. */
  setJobFormat(id: string, format: FormatId): void {
    this.state = {
      ...this.state,
      jobs: this.state.jobs.map((j) => (j.input.id === id ? { ...j, targetFormat: format } : j)),
    };
    this.emit();
  }

  /** If a category's chosen output is no longer valid for its inputs, fix it. */
  private ensureValidOutput(): void {
    let settings = this.state.settings;
    for (const cat of this.categoriesPresent()) {
      const available = this.availableOutputFormats(cat);
      const key = cat === 'audio' ? 'audioFormat' : 'imageFormat';
      if (available.length > 0 && !available.includes(settings[key])) {
        settings = { ...settings, [key]: available[0] };
      }
    }
    if (settings !== this.state.settings) this.state = { ...this.state, settings };
  }

  async updateSettings(patch: Partial<Settings>): Promise<void> {
    this.state = { ...this.state, settings: { ...this.state.settings, ...patch } };
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
   *  (so changing a file's format marks it pending again). */
  private isUpToDate(job: Job): boolean {
    return job.output != null && job.output.format === this.resolveTarget(job);
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
    const targets = force ? this.convertibleJobs() : this.pendingJobs();
    if (targets.length === 0) return;

    this.control = { cancelled: false, paused: false, resume: null };
    this.state = { ...this.state, converting: true, paused: false };
    this.patchJobs(targets.map((j) => j.input.id), {
      stage: 'queued',
      error: undefined,
      output: undefined,
    });

    const onProgress = (e: ProgressEvent) =>
      this.patchJobs([e.inputId], {
        stage: e.stage,
        ...(e.stage === 'error' ? { error: e.message } : {}),
      });

    const tasks: ConvertTask[] = targets.map((j) => ({
      input: j.input,
      options: {
        outputFormat: this.resolveTarget(j) as FormatId,
        quality: this.state.settings.quality,
        resize: this.state.settings.resize,
      },
    }));

    const control = {
      isCancelled: () => this.control.cancelled,
      waitIfPaused: async () => {
        while (this.control.paused && !this.control.cancelled) {
          await new Promise<void>((res) => (this.control.resume = res));
        }
      },
    };

    try {
      // Results are sparse when cancelled (skipped tasks are left undefined);
      // jobs not in the map keep their state (the ones not reached stay 'queued').
      const results = await this.queue.run(tasks, onProgress, CONCURRENCY, control);
      const byId = new Map<string, JobResult>(
        results.filter((r): r is JobResult => r != null).map((r) => [r.inputId, r]),
      );
      this.state = {
        ...this.state,
        jobs: this.state.jobs.map((j) => {
          const r = byId.get(j.input.id);
          if (!r) return j;
          return { ...j, output: r.output, error: r.error };
        }),
      };
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
    return this.state.jobs.flatMap((j) => (j.output ? [j.output] : []));
  }

  downloadOne(id: string): void {
    const job = this.state.jobs.find((j) => j.input.id === id);
    if (job?.output) downloadBlob(job.output.blob, job.output.fileName);
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
