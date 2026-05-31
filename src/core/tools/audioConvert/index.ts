import type { Tool, OutputFile, FormatId } from '../../types';
import { decodeAudio } from './decode';
import { encodeAudio } from '@infra/encodeAudio';
import { renameForFormat } from '@shared/filenames';

const AUDIO_INPUTS: FormatId[] = ['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg'];

/** Apply trim (seconds) + mono mix-down + peak-normalize to a decoded buffer.
 *  Returns the original buffer when no edit is requested. */
function processAudio(
  buffer: AudioBuffer,
  opts: { trimStart?: number; trimEnd?: number; mono?: boolean; normalize?: boolean },
): AudioBuffer {
  const sr = buffer.sampleRate;
  let start = Math.max(0, Math.floor((opts.trimStart ?? 0) * sr));
  let end =
    opts.trimEnd && opts.trimEnd > 0 ? Math.min(buffer.length, Math.floor(opts.trimEnd * sr)) : buffer.length;
  if (end <= start) {
    start = 0;
    end = buffer.length; // invalid range → keep the whole clip
  }
  const trimmed = start > 0 || end < buffer.length;
  if (!trimmed && !opts.mono && !opts.normalize) return buffer;

  const frames = end - start;
  const srcCh = buffer.numberOfChannels;
  const outCh = opts.mono ? 1 : srcCh;
  const out: Float32Array[] = Array.from({ length: outCh }, () => new Float32Array(frames));

  if (opts.mono) {
    for (let i = 0; i < frames; i++) {
      let s = 0;
      for (let c = 0; c < srcCh; c++) s += buffer.getChannelData(c)[start + i];
      out[0][i] = s / srcCh;
    }
  } else {
    for (let c = 0; c < outCh; c++) {
      const src = buffer.getChannelData(c);
      for (let i = 0; i < frames; i++) out[c][i] = src[start + i];
    }
  }

  if (opts.normalize) {
    let peak = 0;
    for (const ch of out) for (let i = 0; i < frames; i++) peak = Math.max(peak, Math.abs(ch[i]));
    if (peak > 0 && peak < 0.999) {
      const gain = 0.99 / peak;
      for (const ch of out) for (let i = 0; i < frames; i++) ch[i] *= gain;
    }
  }

  const result = new AudioBuffer({ length: frames, numberOfChannels: outCh, sampleRate: sr });
  for (let c = 0; c < outCh; c++) result.getChannelData(c).set(out[c]);
  return result;
}

/**
 * Audio in (whatever the browser can decode) → WAV / MP3.
 * Decode is browser-native (Web Audio); WAV encode is hand-rolled, MP3 via
 * lamejs (lazy). Sequential to bound the PCM memory cost.
 */
export const audioConvertTool: Tool = {
  id: 'audio-convert',
  title: 'Audio → WAV / MP3 / OGG',
  category: 'audio',
  inputFormats: AUDIO_INPUTS,
  outputFormats: ['wav', 'mp3', 'ogg'],
  accepts: (i) => AUDIO_INPUTS.includes(i.detectedFormat as FormatId),

  async run(inputs, options, onProgress) {
    const results: OutputFile[] = [];

    for (const input of inputs) {
      try {
        onProgress?.({ inputId: input.id, stage: 'decoding' });
        const decoded = await decodeAudio(input.file);
        const audio = processAudio(decoded, {
          trimStart: options.trimStart,
          trimEnd: options.trimEnd,
          mono: options.audioMono,
          normalize: options.normalize,
        });

        onProgress?.({ inputId: input.id, stage: 'encoding' });
        const blob = await encodeAudio(audio, options.outputFormat, options.quality, options.audioBitrate);

        results.push({
          blob,
          fileName: renameForFormat(input.name, options.outputFormat),
          format: options.outputFormat,
        });
        onProgress?.({ inputId: input.id, stage: 'done' });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        onProgress?.({ inputId: input.id, stage: 'error', message });
      }
    }

    return results;
  },
};
