import type { FormatId } from '@core/types';

/**
 * Encode a decoded AudioBuffer to the target audio format.
 *  - wav: hand-rolled 16-bit PCM, no dependency (lossless).
 *  - mp3: @breezystack/lamejs, lazy-loaded (quality 0..1 -> bitrate).
 */
export async function encodeAudio(
  buffer: AudioBuffer,
  format: FormatId,
  quality = 0.9,
  bitrate = 0,
): Promise<Blob> {
  if (format === 'wav') {
    return new Blob([encodeWav(buffer)], { type: 'audio/wav' });
  }
  if (format === 'mp3') {
    return encodeMp3(buffer, quality, bitrate);
  }
  throw new Error(`Cannot encode to audio format "${format}"`);
}

/** Interleave channels and write a standard 44-byte PCM WAV (16-bit). */
export function encodeWav(buffer: AudioBuffer): ArrayBuffer {
  const numCh = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const frames = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numCh * bytesPerSample;
  const dataSize = frames * blockAlign;

  const out = new ArrayBuffer(44 + dataSize);
  const view = new DataView(out);

  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numCh, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // bits per sample
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  const channels: Float32Array[] = [];
  for (let c = 0; c < numCh; c++) channels.push(buffer.getChannelData(c));

  let offset = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < numCh; c++) {
      let s = channels[c][i];
      s = s < -1 ? -1 : s > 1 ? 1 : s; // clamp
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  }

  return out;
}

// MP3 (MPEG-1/2/2.5 layer III) only allows these sample rates. A decoded source
// at any other rate (e.g. 96/192 kHz hi-res FLAC) must be resampled first, or
// lamejs produces a file that plays at the wrong speed.
const MP3_RATES = [8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000];

function nearestMp3Rate(rate: number): number {
  return MP3_RATES.reduce((best, r) => (Math.abs(r - rate) < Math.abs(best - rate) ? r : best));
}

/** Resample an AudioBuffer to `targetRate` via an OfflineAudioContext render. */
async function resample(buffer: AudioBuffer, targetRate: number): Promise<AudioBuffer> {
  const Ctor =
    globalThis.OfflineAudioContext ??
    (globalThis as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext })
      .webkitOfflineAudioContext;
  const frames = Math.max(1, Math.ceil(buffer.duration * targetRate));
  const oac = new Ctor(buffer.numberOfChannels, frames, targetRate);
  const src = oac.createBufferSource();
  src.buffer = buffer;
  src.connect(oac.destination);
  src.start();
  return oac.startRendering();
}

async function encodeMp3(buffer: AudioBuffer, quality: number, bitrate = 0): Promise<Blob> {
  const { Mp3Encoder } = await import('@breezystack/lamejs');

  // Coerce to a sample rate lamejs accepts before touching the encoder.
  const audio = MP3_RATES.includes(buffer.sampleRate)
    ? buffer
    : await resample(buffer, nearestMp3Rate(buffer.sampleRate));

  const numCh = Math.min(audio.numberOfChannels, 2); // lamejs: mono or stereo
  const sampleRate = audio.sampleRate;
  // Explicit bitrate wins; otherwise derive it from the quality slider.
  const kbps =
    bitrate > 0
      ? Math.min(320, Math.max(64, Math.round(bitrate)))
      : Math.min(320, Math.max(96, Math.round(96 + quality * 224)));
  const encoder = new Mp3Encoder(numCh, sampleRate, kbps);

  const left = floatToInt16(audio.getChannelData(0));
  const right = numCh > 1 ? floatToInt16(audio.getChannelData(1)) : undefined;

  const chunk = 1152;
  const parts: Uint8Array[] = [];
  for (let i = 0; i < left.length; i += chunk) {
    const l = left.subarray(i, i + chunk);
    const r = right ? right.subarray(i, i + chunk) : undefined;
    const block = right ? encoder.encodeBuffer(l, r) : encoder.encodeBuffer(l);
    if (block.length) parts.push(block);
  }
  const end = encoder.flush();
  if (end.length) parts.push(end);

  return new Blob(parts as BlobPart[], { type: 'audio/mpeg' });
}

function floatToInt16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = input[i] < -1 ? -1 : input[i] > 1 ? 1 : input[i];
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}
