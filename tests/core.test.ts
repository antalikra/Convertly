import { describe, it, expect } from 'vitest';
import { buildRegistry } from '../src/core/registerTools';
import { ToolRegistry } from '../src/core/ToolRegistry';
import { renameForFormat } from '../src/shared/filenames';
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
    expect(reg.all()).toHaveLength(4);
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
