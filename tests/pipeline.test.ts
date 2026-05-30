import { describe, it, expect } from 'vitest';
import { detectFormat } from '../src/infra/fileRead';
import { encodeBmp } from '../src/infra/encode';
import { encodeWav } from '../src/infra/encodeAudio';
import { JobQueue, type ConvertTask } from '../src/app/JobQueue';
import { ToolRegistry } from '../src/core/ToolRegistry';
import { Controller } from '../src/app/controller';
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

  it('falls back to extension when the header is garbage', async () => {
    expect(await detectFormat(fileWith([], 'photo.heic'))).toBe('heic');
    expect(await detectFormat(fileWith([], 'clip.ogg'))).toBe('ogg');
    expect(await detectFormat(fileWith([], 'mystery.xyz'))).toBe('unknown');
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
    expect(results.every((r) => r?.output && !r?.error)).toBe(true);
  });

  it('captures a per-file error without aborting the batch', async () => {
    const tool = fakeTool({}, new Set(['b']));
    const tasks: ConvertTask[] = ['a', 'b', 'c'].map((id) => ({
      input: inputOf(id),
      options: { outputFormat: 'png' },
    }));
    const results = await queueWith(tool).run(tasks, () => {}, 2);
    expect(results.find((r) => r?.inputId === 'a')?.output).toBeTruthy();
    expect(results.find((r) => r?.inputId === 'b')?.error).toBe('boom b');
    expect(results.find((r) => r?.inputId === 'c')?.output).toBeTruthy();
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

  it('returns the image output set for image inputs only', async () => {
    const c = new Controller();
    await c.addFiles([jpeg('a.jpg')]);
    expect(c.availableOutputFormats('image')).toEqual(['jpeg', 'png', 'webp', 'avif', 'tiff', 'bmp']);
    expect(c.availableOutputFormats('audio')).toEqual([]);
  });

  it('routes a mixed batch to the right per-category sets', async () => {
    const c = new Controller();
    await c.addFiles([jpeg('a.jpg'), mp3('b.mp3')]);
    expect(c.categoriesPresent()).toEqual(['image', 'audio']);
    expect(c.availableOutputFormats('audio')).toEqual(['wav', 'mp3']);
  });

  it('pendingJobs equals convertibleJobs before anything is converted', async () => {
    const c = new Controller();
    await c.addFiles([jpeg('a.jpg'), jpeg('b.jpg')]);
    expect(c.pendingJobs().length).toBe(2);
    expect(c.pendingJobs().length).toBe(c.convertibleJobs().length);
  });
});
