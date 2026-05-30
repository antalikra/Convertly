import type { Tool, OutputFile, FormatId } from '../../types';
import { decodeAudio } from './decode';
import { encodeAudio } from '@infra/encodeAudio';
import { renameForFormat } from '@shared/filenames';

const AUDIO_INPUTS: FormatId[] = ['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg'];

/**
 * Audio in (whatever the browser can decode) → WAV / MP3.
 * Decode is browser-native (Web Audio); WAV encode is hand-rolled, MP3 via
 * lamejs (lazy). Sequential to bound the PCM memory cost.
 */
export const audioConvertTool: Tool = {
  id: 'audio-convert',
  title: 'Audio → WAV / MP3',
  category: 'audio',
  inputFormats: AUDIO_INPUTS,
  outputFormats: ['wav', 'mp3'],
  accepts: (i) => AUDIO_INPUTS.includes(i.detectedFormat as FormatId),

  async run(inputs, options, onProgress) {
    const results: OutputFile[] = [];

    for (const input of inputs) {
      try {
        onProgress?.({ inputId: input.id, stage: 'decoding' });
        const audio = await decodeAudio(input.file);

        onProgress?.({ inputId: input.id, stage: 'encoding' });
        const blob = await encodeAudio(audio, options.outputFormat, options.quality);

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
