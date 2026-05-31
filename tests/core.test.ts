import { describe, it, expect } from 'vitest';
import { buildRegistry } from '../src/core/registerTools';
import { ToolRegistry } from '../src/core/ToolRegistry';
import { renameForFormat } from '../src/shared/filenames';
import { buildDocx } from '../src/infra/docxWrite';
import { unzipSync, strFromU8 } from 'fflate';
import type { InputFile, Tool } from '../src/core/types';

function input(format: InputFile['detectedFormat'], name = 'IMG_0001.heic'): InputFile {
  return {
    id: 'x',
    file: new File([], name),
    name,
    sizeBytes: 0,
    detectedFormat: format,
  };
}

describe('ToolRegistry', () => {
  it('registers and finds tools by id', () => {
    const reg = buildRegistry();
    expect(reg.getById('heic-convert')).toBeDefined();
    expect(reg.getById('raster-convert')).toBeDefined();
    expect(reg.getById('tiff-convert')).toBeDefined();
    expect(reg.getById('audio-convert')).toBeDefined();
    expect(reg.getById('pdf-rotate')).toBeDefined();
    expect(reg.getById('pdf-split')).toBeDefined();
    expect(reg.getById('pdf-merge')).toBeDefined();
    expect(reg.getById('images-to-pdf')).toBeDefined();
    expect(reg.getById('pdf-to-images')).toBeDefined();
    expect(reg.getById('pdf-to-text')).toBeDefined();
    expect(reg.getById('pdf-to-docx')).toBeDefined();
    expect(reg.getById('docx-to-pdf')).toBeDefined();
    expect(reg.getById('docx-to-text')).toBeDefined();
    expect(reg.getById('docx-to-html')).toBeDefined();
    expect(reg.all()).toHaveLength(14);
  });

  it('rejects duplicate ids', () => {
    const reg = new ToolRegistry();
    const fake: Tool = {
      id: 'dup',
      title: '',
      category: '',
      inputFormats: [],
      outputFormats: [],
      accepts: () => false,
      run: async () => [],
    };
    reg.register(fake);
    expect(() => reg.register(fake)).toThrow();
  });

  it('finds heic tool for heic → jpeg', () => {
    const reg = buildRegistry();
    const tools = reg.findForConversion(input('heic'), 'jpeg');
    expect(tools.map((t) => t.id)).toEqual(['heic-convert']);
  });

  it('finds raster tool for jpeg → png', () => {
    const reg = buildRegistry();
    const tools = reg.findForConversion(input('jpeg'), 'png');
    expect(tools.map((t) => t.id)).toEqual(['raster-convert']);
  });

  it('routes pdf → pdf to all three PDF tools (operation disambiguates at run time)', () => {
    const reg = buildRegistry();
    const tools = reg.findForConversion(input('pdf', 'doc.pdf'), 'pdf');
    expect(tools.map((t) => t.id).sort()).toEqual(['pdf-merge', 'pdf-rotate', 'pdf-split']);
    expect(tools.map((t) => t.operation).sort()).toEqual(['merge', 'rotate', 'split']);
  });

  it('resolve() picks the PDF tool by operation', () => {
    const reg = buildRegistry();
    const pdf = input('pdf', 'doc.pdf');
    expect(reg.resolve(pdf, 'pdf', 'rotate')?.id).toBe('pdf-rotate');
    expect(reg.resolve(pdf, 'pdf', 'split')?.id).toBe('pdf-split');
    expect(reg.resolve(pdf, 'pdf', 'merge')?.id).toBe('pdf-merge');
    // The merge tool is the aggregate (N→1) one.
    expect(reg.resolve(pdf, 'pdf', 'merge')?.aggregate).toBe(true);
    // Single-handler pairs ignore operation.
    expect(reg.resolve(input('jpeg'), 'png')?.id).toBe('raster-convert');
  });

  it('routes image → pdf to the images-to-pdf aggregate', () => {
    const reg = buildRegistry();
    const tool = reg.resolve(input('jpeg'), 'pdf');
    expect(tool?.id).toBe('images-to-pdf');
    expect(tool?.aggregate).toBe(true);
  });

  it('routes docx → pdf/txt/html to their tools', () => {
    const reg = buildRegistry();
    const docx = input('docx', 'cv.docx');
    expect(reg.resolve(docx, 'pdf')?.id).toBe('docx-to-pdf');
    expect(reg.resolve(docx, 'txt')?.id).toBe('docx-to-text');
    expect(reg.resolve(docx, 'html')?.id).toBe('docx-to-html');
  });

  it('routes pdf → jpg/png to the pdf-to-images tool (1→N)', () => {
    const reg = buildRegistry();
    const pdf = input('pdf', 'doc.pdf');
    expect(reg.resolve(pdf, 'jpeg')?.id).toBe('pdf-to-images');
    expect(reg.resolve(pdf, 'png')?.id).toBe('pdf-to-images');
    expect(reg.resolve(pdf, 'txt')?.id).toBe('pdf-to-text');
    expect(reg.resolve(pdf, 'docx')?.id).toBe('pdf-to-docx');
    // pdf → pdf still only the rotate/split/merge tools.
    expect(reg.findForConversion(pdf, 'pdf').map((t) => t.id).sort()).toEqual([
      'pdf-merge', 'pdf-rotate', 'pdf-split',
    ]);
  });

  it('routes each image format to exactly one tool', () => {
    const reg = buildRegistry();
    const images = ['heic', 'heif', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'avif', 'tiff'] as const;
    for (const fmt of images) {
      expect(reg.findForConversion(input(fmt), 'jpeg')).toHaveLength(1);
    }
  });

  it('routes each audio format to exactly one tool', () => {
    const reg = buildRegistry();
    const audio = ['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg'] as const;
    for (const fmt of audio) {
      expect(reg.findForConversion(input(fmt), 'wav')).toHaveLength(1);
    }
  });

  it('does not route an image to an audio output (or vice versa)', () => {
    const reg = buildRegistry();
    expect(reg.findForConversion(input('jpeg'), 'wav')).toHaveLength(0);
    expect(reg.findForConversion(input('mp3'), 'jpeg')).toHaveLength(0);
  });

  it('handles heif input', () => {
    const reg = buildRegistry();
    expect(reg.findForConversion(input('heif'), 'webp')).toHaveLength(1);
  });

  it('finds no tool for unknown input', () => {
    const reg = buildRegistry();
    expect(reg.findForConversion(input('unknown'), 'jpeg')).toHaveLength(0);
  });
});

describe('renameForFormat', () => {
  it('swaps heic for jpg', () => {
    expect(renameForFormat('IMG_1234.heic', 'jpeg')).toBe('IMG_1234.jpg');
  });
  it('swaps for png and webp', () => {
    expect(renameForFormat('photo.HEIC', 'png')).toBe('photo.png');
    expect(renameForFormat('a.heif', 'webp')).toBe('a.webp');
  });
  it('handles names without extension', () => {
    expect(renameForFormat('noext', 'jpeg')).toBe('noext.jpg');
  });
  it('keeps dots in the base name', () => {
    expect(renameForFormat('my.photo.heic', 'jpeg')).toBe('my.photo.jpg');
  });
  it('handles bmp output extension', () => {
    expect(renameForFormat('IMG_1234.avif', 'bmp')).toBe('IMG_1234.bmp');
  });
});

describe('buildDocx', () => {
  it('produces a valid OOXML zip with one paragraph per line', () => {
    const bytes = buildDocx('First line\nSecond line');
    const files = unzipSync(bytes);
    // The three parts Word needs.
    expect(Object.keys(files).sort()).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'word/document.xml',
    ]);
    const doc = strFromU8(files['word/document.xml']);
    expect((doc.match(/<w:p>/g) ?? []).length).toBe(2);
    expect(doc).toContain('First line');
    expect(doc).toContain('Second line');
  });

  it('escapes XML metacharacters and keeps blank lines as empty paragraphs', () => {
    const doc = strFromU8(unzipSync(buildDocx('a < b & c\n\nx'))['word/document.xml']);
    expect(doc).toContain('a &lt; b &amp; c');
    expect(doc).not.toContain('a < b & c'); // raw, unescaped form must not leak
    expect(doc).toContain('<w:p/>'); // the blank middle line
  });
});
