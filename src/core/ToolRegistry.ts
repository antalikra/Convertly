import type { Tool, InputFile, FormatId } from './types';

/**
 * Registry of tools. The controller never references concrete tools; it asks
 * the registry "who can handle this input → output format?". Adding a feature
 * means registering a new Tool, not editing this class (Golden rule #4).
 */
export class ToolRegistry {
  private tools: Tool[] = [];

  register(tool: Tool): void {
    if (this.getById(tool.id)) {
      throw new Error(`Tool with id "${tool.id}" already registered`);
    }
    this.tools.push(tool);
  }

  getById(id: string): Tool | undefined {
    return this.tools.find((t) => t.id === id);
  }

  findForConversion(input: InputFile, output: FormatId): Tool[] {
    return this.tools.filter((t) => t.accepts(input) && t.outputFormats.includes(output));
  }

  /**
   * The single tool to run for input→output. When several share that pair (PDF
   * rotate / split / merge), `operation` picks; otherwise the sole handler
   * (no `operation`) wins.
   */
  resolve(input: InputFile, output: FormatId, operation?: string): Tool | undefined {
    const candidates = this.findForConversion(input, output);
    if (candidates.length <= 1) return candidates[0];
    return (
      candidates.find((t) => t.operation != null && t.operation === operation) ??
      candidates.find((t) => t.operation == null) ??
      candidates[0]
    );
  }

  all(): Tool[] {
    return [...this.tools];
  }
}
