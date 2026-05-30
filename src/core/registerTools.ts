import { ToolRegistry } from './ToolRegistry';
import { heicConvertTool } from './tools/heicConvert';
import { rasterConvertTool } from './tools/rasterConvert';
import { tiffConvertTool } from './tools/tiffConvert';
import { audioConvertTool } from './tools/audioConvert';

/** The single place where all tools are assembled. */
export function buildRegistry(): ToolRegistry {
  const reg = new ToolRegistry();
  reg.register(heicConvertTool); // HEIC/HEIF in (libheif)
  reg.register(rasterConvertTool); // JPG/PNG/WebP/GIF/BMP/AVIF in (browser-native)
  reg.register(tiffConvertTool); // TIFF in (utif2)
  reg.register(audioConvertTool); // MP3/WAV/FLAC/M4A/AAC/OGG in (Web Audio)
  // Future: reg.register(pdfMergeTool);
  return reg;
}
