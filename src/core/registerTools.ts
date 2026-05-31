import { ToolRegistry } from './ToolRegistry';
import { heicConvertTool } from './tools/heicConvert';
import { rasterConvertTool } from './tools/rasterConvert';
import { tiffConvertTool } from './tools/tiffConvert';
import { audioConvertTool } from './tools/audioConvert';
import { pdfRotateTool } from './tools/pdfRotate';
import { pdfSplitTool } from './tools/pdfSplit';
import { pdfMergeTool } from './tools/pdfMerge';
import { imagesToPdfTool } from './tools/imagesToPdf';
import { pdfToImagesTool } from './tools/pdfToImages';
import { pdfToTextTool } from './tools/pdfToText';

/** The single place where all tools are assembled. */
export function buildRegistry(): ToolRegistry {
  const reg = new ToolRegistry();
  reg.register(heicConvertTool); // HEIC/HEIF in (libheif)
  reg.register(rasterConvertTool); // JPG/PNG/WebP/GIF/BMP/AVIF in (browser-native)
  reg.register(tiffConvertTool); // TIFF in (utif2)
  reg.register(audioConvertTool); // MP3/WAV/FLAC/M4A/AAC/OGG in (Web Audio)
  reg.register(pdfRotateTool); // PDF rotate (pdf-lib) — 1→1, operation 'rotate'
  reg.register(pdfSplitTool); // PDF split pages (pdf-lib) — 1→N, operation 'split'
  reg.register(pdfMergeTool); // PDF merge (pdf-lib) — N→1 aggregate, operation 'merge'
  reg.register(imagesToPdfTool); // Images → PDF (pdf-lib) — N→1 aggregate
  reg.register(pdfToImagesTool); // PDF → JPG/PNG (pdf.js) — 1→N per page
  reg.register(pdfToTextTool); // PDF → TXT (pdf.js getTextContent) — 1→1
  return reg;
}
