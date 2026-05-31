import { describe, it, expect } from 'vitest';
import { PDFDocument, degrees } from 'pdf-lib';
import { detectFormat } from '../src/infra/fileRead';
import { encodeBmp } from '../src/infra/encode';
import { encodeWav } from '../src/infra/encodeAudio';
import { JobQueue, type ConvertTask } from '../src/app/JobQueue';
import { ToolRegistry } from '../src/core/ToolRegistry';
import { Controller } from '../src/app/controller';
import { buildRegistry } from '../src/core/registerTools';
import { pdfRotateTool } from '../src/core/tools/pdfRotate';
import { pdfSplitTool } from '../src/core/tools/pdfSplit';
import { pdfMergeTool } from '../src/core/tools/pdfMerge';
import type { InputFile, OutputFile, ProgressEvent, Tool } from '../src/core/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a File whose head carries the given bytes (ascii string or numbers). */
function fileWith(parts: Array<{ at: number; bytes: string | number[] }>, name = 'x.bin'): File {
  const buf = new Uint8Array(32);
  for (const p of parts) {
    const bytes =
      typeof p.bytes === 'string' ? [...p.bytes].map((c) => c.charCodeAt(0)) : p.bytes;
    buf.set(bytes, p.at);
  }
  return new File([buf], name);
}

const str = (view: DataView, off: number, len: number) =>
  String.fromCharCode(...new Uint8Array(view.buffer, off, len));

// ---------------------------------------------------------------------------
// detectFormat — magic bytes vs extension fallback
// ---------------------------------------------------------------------------

describe('detectFormat (magic bytes)', () => {
  it('detects raster image signatures', async () => {
    expect(await detectFormat(fileWith([{ at: 0, bytes: [0xff, 0xd8, 0xff] }]))).toBe('jpeg');
    expect(await detectFormat(fileWith([{ at: 0, bytes: [0x89, 0x50, 0x4e, 0x47] }]))).toBe('png');
    expect(await detectFormat(fileWith([{ at: 0, bytes: 'GIF89a' }]))).toBe('gif');
    expect(await detectFormat(fileWith([{ at: 0, bytes: [0x42, 0x4d] }]))).toBe('bmp');
    expect(await detectFormat(fileWith([{ at: 0, bytes: [0x49, 0x49, 0x2a, 0x00] }]))).toBe('tiff');
  });

  it('detects ftyp container brands', async () => {
    const heic = fileWith([{ at: 4, bytes: 'ftyp' }, { at: 8, bytes: 'heic' }]);
    const avif = fileWith([{ at: 4, bytes: 'ftyp' }, { at: 8, bytes: 'avif' }]);
    const m4a = fileWith([{ at: 4, bytes: 'ftyp' }, { at: 8, bytes: 'M4A ' }]);
    expect(await detectFormat(heic)).toBe('heic');
    expect(await detectFormat(avif)).toBe('avif');
    expect(await detectFormat(m4a)).toBe('m4a');
  });

  it('does NOT misread MP4 video as audio/image', async () => {
    const mp4 = fileWith([{ at: 4, bytes: 'ftyp' }, { at: 8, bytes: 'isom' }], 'movie.mp4');
    expect(await detectFormat(mp4)).toBe('unknown');
  });

  it('disambiguates RIFF: WebP vs WAV', async () => {
    const webp = fileWith([{ at: 0, bytes: 'RIFF' }, { at: 8, bytes: 'WEBP' }]);
    const wav = fileWith([{ at: 0, bytes: 'RIFF' }, { at: 8, bytes: 'WAVE' }]);
    expect(await detectFormat(webp)).toBe('webp');
    expect(await detectFormat(wav)).toBe('wav');
  });

  it('detects audio signatures', async () => {
    expect(await detectFormat(fileWith([{ at: 0, bytes: 'fLaC' }]))).toBe('flac');
    expect(await detectFormat(fileWith([{ at: 0, bytes: 'OggS' }]))).toBe('ogg');
    expect(await detectFormat(fileWith([{ at: 0, bytes: 'ID3' }]))).toBe('mp3');
    expect(await detectFormat(fileWith([{ at: 0, bytes: [0xff, 0xfb] }]))).toBe('mp3');
  });

  it('detects a PDF by its %PDF- header', async () => {
    expect(await detectFormat(fileWith([{ at: 0, bytes: '%PDF-' }], 'doc.pdf'))).toBe('pdf');
  });

  it('falls back to extension when the header is garbage', async () => {
    expect(await detectFormat(fileWith([], 'photo.heic'))).toBe('heic');
    expect(await detectFormat(fileWith([], 'clip.ogg'))).toBe('ogg');
    expect(await detectFormat(fileWith([], 'report.pdf'))).toBe('pdf');
    expect(await detectFormat(fileWith([], 'resume.docx'))).toBe('docx');
    expect(await detectFormat(fileWith([], 'mystery.xyz'))).toBe('unknown');
  });
});

// ---------------------------------------------------------------------------
// pdfRotate — pdf-lib runs in Node, so this is unit-testable without a browser
// ---------------------------------------------------------------------------

describe('pdfRotateTool', () => {
  /** Build a 1-page PDF (optionally pre-rotated) as an InputFile. */
  async function pdfInput(id: string, startAngle = 0): Promise<InputFile> {
    const doc = await PDFDocument.create();
    const page = doc.addPage([200, 300]);
    if (startAngle) page.setRotation(degrees(startAngle));
    const bytes = await doc.save();
    const file = new File([new Uint8Array(bytes)], `${id}.pdf`, { type: 'application/pdf' });
    return { id, file, name: `${id}.pdf`, sizeBytes: bytes.byteLength, detectedFormat: 'pdf' };
  }

  async function rotationOf(out: OutputFile): Promise<number> {
    const doc = await PDFDocument.load(await out.blob.arrayBuffer());
    return doc.getPages()[0].getRotation().angle;
  }

  it('rotates a page by the requested angle', async () => {
    const [out] = await pdfRotateTool.run([await pdfInput('a')], { outputFormat: 'pdf', rotateAngle: 90 });
    expect(out.format).toBe('pdf');
    expect(out.fileName).toBe('a.pdf');
    expect(await rotationOf(out)).toBe(90);
  });

  it('adds to an existing rotation, wrapping at 360', async () => {
    const [out] = await pdfRotateTool.run(
      [await pdfInput('b', 270)],
      { outputFormat: 'pdf', rotateAngle: 180 },
    );
    expect(await rotationOf(out)).toBe(90); // (270 + 180) % 360
  });

  it('emits a per-file error instead of throwing on a non-PDF blob', async () => {
    const bad: InputFile = {
      id: 'c', file: new File([new Uint8Array([1, 2, 3])], 'c.pdf'),
      name: 'c.pdf', sizeBytes: 3, detectedFormat: 'pdf',
    };
    const events: ProgressEvent[] = [];
    const out = await pdfRotateTool.run([bad], { outputFormat: 'pdf', rotateAngle: 90 }, (e) =>
      events.push(e),
    );
    expect(out).toHaveLength(0);
    expect(events.some((e) => e.stage === 'error')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// pdfSplit — 1→N, and operation routing through the real registry/queue
// ---------------------------------------------------------------------------

async function pdfFileInput(id: string, pages: number): Promise<InputFile> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([200, 300]);
  const bytes = await doc.save();
  const file = new File([new Uint8Array(bytes)], `${id}.pdf`, { type: 'application/pdf' });
  return { id, file, name: file.name, sizeBytes: bytes.byteLength, detectedFormat: 'pdf' };
}

describe('pdfSplitTool', () => {
  it('splits an N-page PDF into N single-page PDFs', async () => {
    const outs = await pdfSplitTool.run([await pdfFileInput('doc', 3)], { outputFormat: 'pdf' });
    expect(outs).toHaveLength(3);
    expect(outs.map((o) => o.fileName)).toEqual(['doc-1.pdf', 'doc-2.pdf', 'doc-3.pdf']);
    for (const o of outs) {
      const d = await PDFDocument.load(await o.blob.arrayBuffer());
      expect(d.getPageCount()).toBe(1);
    }
  });

  it('zero-pads output names to the page count', async () => {
    const outs = await pdfSplitTool.run([await pdfFileInput('doc', 10)], { outputFormat: 'pdf' });
    expect(outs[0].fileName).toBe('doc-01.pdf');
    expect(outs[9].fileName).toBe('doc-10.pdf');
  });
});

describe('JobQueue PDF operation routing', () => {
  it('picks split (1→N) vs rotate (1→1) for the same pdf→pdf pair', async () => {
    const q = new JobQueue(buildRegistry());
    const input = await pdfFileInput('a', 4);

    const [splitRes] = await q.run(
      [{ input, options: { outputFormat: 'pdf', operation: 'split' } }],
      () => {},
    );
    expect(splitRes?.outputs).toHaveLength(4);

    const [rotateRes] = await q.run(
      [{ input, options: { outputFormat: 'pdf', operation: 'rotate', rotateAngle: 90 } }],
      () => {},
    );
    expect(rotateRes?.outputs).toHaveLength(1);
  });
});

describe('pdfMergeTool (N→1 aggregate)', () => {
  it('appends all pages into one PDF in input order', async () => {
    const a = await pdfFileInput('a', 1);
    const b = await pdfFileInput('b', 2);
    const outs = await pdfMergeTool.run([a, b], { outputFormat: 'pdf', operation: 'merge' });
    expect(outs).toHaveLength(1);
    expect(outs[0].fileName).toBe('a-merged.pdf');
    const merged = await PDFDocument.load(await outs[0].blob.arrayBuffer());
    expect(merged.getPageCount()).toBe(3); // 1 + 2
  });
});

// ---------------------------------------------------------------------------
// BMP / WAV header bytes
// ---------------------------------------------------------------------------

describe('encodeBmp header', () => {
  it('writes a valid 2×2 32bpp BITMAPINFOHEADER and swaps RGBA→BGRA', () => {
    const data = new Uint8ClampedArray(2 * 2 * 4);
    // top-left pixel = R=10 G=20 B=30 A=40
    data.set([10, 20, 30, 40], 0);
    const buf = encodeBmp({ width: 2, height: 2, data } as ImageData);
    const v = new DataView(buf);

    expect(str(v, 0, 2)).toBe('BM');
    expect(v.getUint32(2, true)).toBe(54 + 16); // 14 + 40 headers + 2*2*4 px
    expect(v.getUint32(10, true)).toBe(54); // pixel offset
    expect(v.getUint32(14, true)).toBe(40); // info header size
    expect(v.getInt32(18, true)).toBe(2); // width
    expect(v.getInt32(22, true)).toBe(2); // height (positive = bottom-up)
    expect(v.getUint16(28, true)).toBe(32); // bpp

    // Bottom-up: source row 0 lands in the LAST pixel row → offset 54 + (1)*2*4
    const d = 54 + 8;
    expect(v.getUint8(d)).toBe(30); // B
    expect(v.getUint8(d + 1)).toBe(20); // G
    expect(v.getUint8(d + 2)).toBe(10); // R
    expect(v.getUint8(d + 3)).toBe(40); // A
  });
});

describe('encodeWav header', () => {
  it('writes a 44-byte PCM header with correct sizes', () => {
    const fake = {
      numberOfChannels: 1,
      sampleRate: 44100,
      length: 4,
      getChannelData: () => new Float32Array(4),
    } as unknown as AudioBuffer;
    const buf = encodeWav(fake);
    const v = new DataView(buf);

    expect(buf.byteLength).toBe(44 + 4 * 1 * 2);
    expect(str(v, 0, 4)).toBe('RIFF');
    expect(v.getUint32(4, true)).toBe(36 + 8); // 36 + dataSize
    expect(str(v, 8, 4)).toBe('WAVE');
    expect(str(v, 12, 4)).toBe('fmt ');
    expect(v.getUint16(20, true)).toBe(1); // PCM
    expect(v.getUint16(22, true)).toBe(1); // channels
    expect(v.getUint32(24, true)).toBe(44100); // sample rate
    expect(v.getUint16(34, true)).toBe(16); // bits per sample
    expect(str(v, 36, 4)).toBe('data');
    expect(v.getUint32(40, true)).toBe(8); // dataSize
  });
});

// ---------------------------------------------------------------------------
// JobQueue — ordering, error capture, empty, missing-tool
// ---------------------------------------------------------------------------

function inputOf(id: string, format: InputFile['detectedFormat'] = 'jpeg'): InputFile {
  return { id, file: new File([], `${id}.jpg`), name: `${id}.jpg`, sizeBytes: 0, detectedFormat: format };
}

/** A tool that resolves after `delayById` ms, so completion order ≠ input order. */
function fakeTool(delayById: Record<string, number>, failIds: Set<string> = new Set()): Tool {
  return {
    id: 'fake',
    title: 'fake',
    category: 'image-convert',
    inputFormats: ['jpeg'],
    outputFormats: ['png'],
    accepts: () => true,
    async run(inputs, options, onProgress): Promise<OutputFile[]> {
      const out: OutputFile[] = [];
      for (const i of inputs) {
        await new Promise((r) => setTimeout(r, delayById[i.id] ?? 0));
        if (failIds.has(i.id)) {
          onProgress?.({ inputId: i.id, stage: 'error', message: `boom ${i.id}` });
          continue;
        }
        const blob = new Blob(['x']);
        out.push({ blob, fileName: `${i.id}.png`, format: options.outputFormat });
        onProgress?.({ inputId: i.id, stage: 'done' });
      }
      return out;
    },
  };
}

describe('JobQueue', () => {
  function queueWith(tool: Tool): JobQueue {
    const reg = new ToolRegistry();
    reg.register(tool);
    return new JobQueue(reg);
  }

  it('keeps results in input order despite out-of-order completion', async () => {
    // a finishes last, c finishes first — results must still be [a, b, c].
    const tool = fakeTool({ a: 30, b: 15, c: 1 });
    const tasks: ConvertTask[] = ['a', 'b', 'c'].map((id) => ({
      input: inputOf(id),
      options: { outputFormat: 'png' },
    }));
    const results = await queueWith(tool).run(tasks, () => {}, 4);
    expect(results.map((r) => r?.inputId)).toEqual(['a', 'b', 'c']);
    expect(results.every((r) => r?.outputs?.length && !r?.error)).toBe(true);
  });

  it('captures a per-file error without aborting the batch', async () => {
    const tool = fakeTool({}, new Set(['b']));
    const tasks: ConvertTask[] = ['a', 'b', 'c'].map((id) => ({
      input: inputOf(id),
      options: { outputFormat: 'png' },
    }));
    const results = await queueWith(tool).run(tasks, () => {}, 2);
    expect(results.find((r) => r?.inputId === 'a')?.outputs?.length).toBeTruthy();
    expect(results.find((r) => r?.inputId === 'b')?.error).toBe('boom b');
    expect(results.find((r) => r?.inputId === 'c')?.outputs?.length).toBeTruthy();
  });

  it('reports a missing tool as a per-file error', async () => {
    const reg = new ToolRegistry(); // no tools
    const q = new JobQueue(reg);
    const events: ProgressEvent[] = [];
    const results = await q.run(
      [{ input: inputOf('a'), options: { outputFormat: 'png' } }],
      (e) => events.push(e),
      4,
    );
    expect(results[0]?.error).toMatch(/No tool/);
    expect(events.some((e) => e.stage === 'error')).toBe(true);
  });

  it('handles an empty task list', async () => {
    const results = await queueWith(fakeTool({})).run([], () => {}, 4);
    expect(results).toEqual([]);
  });

  it('stops starting new tasks after cancel (in-flight finishes)', async () => {
    const ran: string[] = [];
    const tool: Tool = {
      id: 'rec',
      title: '',
      category: 'image-convert',
      inputFormats: ['jpeg'],
      outputFormats: ['png'],
      accepts: () => true,
      async run(inputs, options, onProgress): Promise<OutputFile[]> {
        const out: OutputFile[] = [];
        for (const i of inputs) {
          ran.push(i.id);
          await new Promise((r) => setTimeout(r, 10));
          out.push({ blob: new Blob(['x']), fileName: `${i.id}.png`, format: options.outputFormat });
          onProgress?.({ inputId: i.id, stage: 'done' });
        }
        return out;
      },
    };
    let cancelled = false;
    const control = { isCancelled: () => cancelled, waitIfPaused: async () => {} };
    const tasks: ConvertTask[] = ['a', 'b', 'c', 'd', 'e'].map((id) => ({
      input: inputOf(id),
      options: { outputFormat: 'png' },
    }));

    const p = queueWith(tool).run(tasks, () => {}, 1, control);
    setTimeout(() => (cancelled = true), 15);
    const results = await p;

    expect(ran.length).toBeLessThan(5); // cancel stopped the pool early
    expect(results.filter(Boolean).length).toBe(ran.length);
  });
});

// ---------------------------------------------------------------------------
// Controller.availableOutputFormats — per-category intersection
// ---------------------------------------------------------------------------

describe('Controller.availableOutputFormats', () => {
  function jpeg(name: string): File {
    return new File([new Uint8Array([0xff, 0xd8, 0xff])], name);
  }
  function mp3(name: string): File {
    return new File([new Uint8Array([0x49, 0x44, 0x33])], name); // 'ID3'
  }
  function pdf(name: string): File {
    return new File([new TextEncoder().encode('%PDF-1.4')], name);
  }
  async function realPdf(name: string, pages: number): Promise<File> {
    const doc = await PDFDocument.create();
    for (let i = 0; i < pages; i++) doc.addPage([200, 300]);
    const bytes = await doc.save();
    return new File([new Uint8Array(bytes)], name, { type: 'application/pdf' });
  }

  it('returns the image output set for image inputs only', async () => {
    const c = new Controller();
    await c.addFiles([jpeg('a.jpg')]);
    expect(c.availableOutputFormats('image')).toEqual([
      'jpeg', 'png', 'webp', 'avif', 'tiff', 'bmp', 'pdf',
    ]);
    expect(c.availableOutputFormats('audio')).toEqual([]);
  });

  it('offers PDF as an image output and routes it to the aggregate tool', async () => {
    const c = new Controller();
    await c.addFiles([jpeg('a.jpg'), jpeg('b.jpg')]);
    expect(c.availableOutputFormats('image')).toContain('pdf');
    await c.updateSettings({ imageFormat: 'pdf' });
    // Both images remain convertible, now targeting the images→PDF aggregate.
    expect(c.convertibleJobs().length).toBe(2);
    expect(c.targetFormat('image')).toBe('pdf');
  });

  it('still offers PDF when the batch includes a HEIC image', async () => {
    const c = new Controller();
    const heic = new File([], 'photo.heic'); // empty header → extension fallback → heic
    await c.addFiles([heic, jpeg('a.jpg')]);
    expect(c.availableOutputFormats('image')).toContain('pdf');
  });

  it('routes a mixed batch to the right per-category sets', async () => {
    const c = new Controller();
    await c.addFiles([jpeg('a.jpg'), mp3('b.mp3')]);
    expect(c.categoriesPresent()).toEqual(['image', 'audio']);
    expect(c.availableOutputFormats('audio')).toEqual(['wav', 'mp3', 'ogg']);
  });

  it('pendingJobs equals convertibleJobs before anything is converted', async () => {
    const c = new Controller();
    await c.addFiles([jpeg('a.jpg'), jpeg('b.jpg')]);
    expect(c.pendingJobs().length).toBe(2);
    expect(c.pendingJobs().length).toBe(c.convertibleJobs().length);
  });

  it('treats a PDF as the document category; default target is pdf', async () => {
    const c = new Controller();
    await c.addFiles([pdf('doc.pdf')]);
    expect(c.categoriesPresent()).toEqual(['document']);
    // PDF can now stay PDF (rotate/split/merge) or rasterise to jpeg/png.
    expect(c.availableOutputFormats('document')).toEqual(['jpeg', 'png', 'pdf']);
    expect(c.targetFormat('document')).toBe('pdf'); // default op = rotate
    expect(c.convertibleJobs().length).toBe(1);
  });

  it('re-marks a converted PDF pending when the rotate angle changes', async () => {
    const c = new Controller();
    await c.addFiles([pdf('doc.pdf')]);
    // Simulate a finished rotate output on the job.
    const id = c.getState().jobs[0].input.id;
    c.getState().jobs[0].outputs = [{ blob: new Blob([]), fileName: 'doc.pdf', format: 'pdf' }];
    c.getState().jobs[0].stage = 'done';
    expect(c.pendingJobs().length).toBe(0); // up-to-date

    await c.updateSettings({ pdfRotateAngle: 180 });
    expect(c.getState().jobs.find((j) => j.input.id === id)?.outputs).toBeUndefined();
    expect(c.pendingJobs().length).toBe(1); // angle change invalidated it
  });

  it('document target follows the PDF operation (rotate→pdf, to JPG→jpeg)', async () => {
    const c = new Controller();
    await c.addFiles([await realPdf('doc.pdf', 2)]);
    expect(c.targetFormat('document')).toBe('pdf'); // default op = rotate

    await c.updateSettings({ pdfOperation: 'tojpg' });
    expect(c.targetFormat('document')).toBe('jpeg');
    expect(c.convertibleJobs().length).toBe(1); // pdf → jpeg via pdf-to-images

    await c.updateSettings({ pdfOperation: 'topng' });
    expect(c.targetFormat('document')).toBe('png');

    await c.updateSettings({ pdfOperation: 'totext' });
    expect(c.targetFormat('document')).toBe('txt');
    expect(c.convertibleJobs().length).toBe(1); // pdf → txt via pdf-to-text
  });

  it('treats DOCX as a document that always targets PDF', async () => {
    const c = new Controller();
    const docx = new File([], 'resume.docx'); // extension fallback → docx
    await c.addFiles([docx]);
    expect(c.categoriesPresent()).toEqual(['document']);
    expect(c.resolveTarget(c.getState().jobs[0])).toBe('pdf');
    expect(c.convertibleJobs().length).toBe(1); // docx → pdf via docx-to-pdf
  });

  it('re-marks a converted PDF pending when the operation changes', async () => {
    const c = new Controller();
    await c.addFiles([pdf('doc.pdf')]);
    c.getState().jobs[0].outputs = [{ blob: new Blob([]), fileName: 'doc.pdf', format: 'pdf' }];
    c.getState().jobs[0].stage = 'done';
    expect(c.pendingJobs().length).toBe(0);

    await c.updateSettings({ pdfOperation: 'split' });
    expect(c.pendingJobs().length).toBe(1); // rotate → split invalidated it
  });

  it('merges PDFs into one aggregate result and folds the inputs in', async () => {
    const c = new Controller();
    await c.addFiles([await realPdf('a.pdf', 1), await realPdf('b.pdf', 2)]);
    await c.updateSettings({ pdfOperation: 'merge' });
    await c.convertAll();

    const st = c.getState();
    expect(st.aggregates).toHaveLength(1);
    expect(st.aggregates[0].sourceCount).toBe(2);
    expect(st.jobs.every((j) => j.aggregated)).toBe(true);
    expect(c.pendingJobs().length).toBe(0); // folded in → nothing pending
    expect(c.outputCount()).toBe(1); // one combined file
    const merged = await PDFDocument.load(await st.aggregates[0].output.blob.arrayBuffer());
    expect(merged.getPageCount()).toBe(3);
  });

  it('drops the merge result when a PDF is added afterwards', async () => {
    const c = new Controller();
    await c.addFiles([await realPdf('a.pdf', 1), await realPdf('b.pdf', 1)]);
    await c.updateSettings({ pdfOperation: 'merge' });
    await c.convertAll();
    expect(c.getState().aggregates).toHaveLength(1);

    await c.addFiles([await realPdf('c.pdf', 1)]);
    expect(c.getState().aggregates).toHaveLength(0); // stale result cleared
    expect(c.getState().jobs.every((j) => !j.aggregated)).toBe(true);
    expect(c.pendingJobs().length).toBe(3); // all three re-merge on next Convert
  });

  it('keeps a PDF merge result when an unrelated media file is added', async () => {
    const c = new Controller();
    await c.addFiles([await realPdf('a.pdf', 1), await realPdf('b.pdf', 1)]);
    await c.updateSettings({ pdfOperation: 'merge' });
    await c.convertAll();
    expect(c.getState().aggregates).toHaveLength(1);

    // Different category → must NOT reset the PDF merge.
    await c.addFiles([jpeg('photo.jpg')]);
    expect(c.getState().aggregates).toHaveLength(1);
    expect(c.getState().jobs.filter((j) => j.aggregated).length).toBe(2);
    expect(c.pendingJobs().length).toBe(1); // only the new image is pending
  });

  it('merges each group into its own file', async () => {
    const c = new Controller();
    await c.addFiles([
      await realPdf('a.pdf', 1),
      await realPdf('b.pdf', 1),
      await realPdf('c.pdf', 1),
    ]);
    await c.updateSettings({ pdfOperation: 'merge' });
    const ids = c.getState().jobs.map((j) => j.input.id);
    c.setJobGroup(ids[2], 2); // a,b → group 1; c → group 2
    await c.convertAll();

    const st = c.getState();
    expect(st.aggregates).toHaveLength(2);
    expect(st.aggregates.find((a) => a.group === 1)?.sourceCount).toBe(2);
    expect(st.aggregates.find((a) => a.group === 2)?.sourceCount).toBe(1);
    expect(c.outputCount()).toBe(2);
    // Multiple groups → names carry the group suffix.
    expect(st.aggregates.every((a) => /-\d\.pdf$/.test(a.output.fileName))).toBe(true);
  });

  it('"each separate" preset yields one result per file', async () => {
    const c = new Controller();
    await c.addFiles([await realPdf('a.pdf', 1), await realPdf('b.pdf', 1)]);
    await c.updateSettings({ pdfOperation: 'merge' });
    c.setGroupMode('document', 'separate');
    await c.convertAll();

    const st = c.getState();
    expect(st.aggregates).toHaveLength(2);
    expect(st.aggregates.every((a) => a.sourceCount === 1)).toBe(true);
  });
});
