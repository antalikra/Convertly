import type { ToolRegistry } from '@core/ToolRegistry';
import type { InputFile, OutputFile, ProgressEvent, Tool, ToolOptions } from '@core/types';

export interface ConvertTask {
  input: InputFile;
  options: ToolOptions;
}

export interface JobResult {
  inputId: string;
  /** A task can produce many files (1→N tools like PDF split). */
  outputs?: OutputFile[];
  error?: string;
}

/** Cooperative control the pool polls between tasks (cancel / pause). */
export interface RunControl {
  isCancelled(): boolean;
  waitIfPaused(): Promise<void>;
}

/**
 * Runs conversion tasks through the registry with a bounded concurrency pool.
 * Each task carries its own output format (per-file overrides supported). The
 * pool size caps how many heavy decoders run at once to protect memory.
 */
export class JobQueue {
  constructor(private readonly registry: ToolRegistry) {}

  async run(
    tasks: ConvertTask[],
    onProgress: (e: ProgressEvent) => void,
    concurrency = 4,
    control?: RunControl,
  ): Promise<Array<JobResult | undefined>> {
    const results: Array<JobResult | undefined> = new Array(tasks.length);
    let next = 0;

    const worker = async (): Promise<void> => {
      while (next < tasks.length) {
        // Pause between files; bail out entirely on cancel. The in-flight task
        // (if any) always finishes — we only stop pulling new ones.
        if (control) {
          await control.waitIfPaused();
          if (control.isCancelled()) return;
        }
        const idx = next++;
        results[idx] = await this.runOne(tasks[idx], onProgress);
      }
    };

    const pool = Array.from({ length: Math.min(concurrency, tasks.length) }, worker);
    await Promise.all(pool);
    return results;
  }

  private async runOne(task: ConvertTask, onProgress: (e: ProgressEvent) => void): Promise<JobResult> {
    const { input, options } = task;
    const tool = this.selectTool(task);
    if (!tool) {
      const message = `No tool for ${input.detectedFormat} → ${options.outputFormat}`;
      onProgress({ inputId: input.id, stage: 'error', message });
      return { inputId: input.id, error: message };
    }

    let failed: string | undefined;
    const outputs = await tool.run([input], options, (e) => {
      if (e.stage === 'error') failed = e.message ?? 'Conversion failed';
      onProgress(e);
    });

    return failed ? { inputId: input.id, error: failed } : { inputId: input.id, outputs };
  }

  /** Pick the handler (operation-aware; see ToolRegistry.resolve). */
  private selectTool({ input, options }: ConvertTask): Tool | undefined {
    return this.registry.resolve(input, options.outputFormat, options.operation);
  }
}
