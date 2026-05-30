// Decode any browser-supported audio file (MP3/WAV/FLAC/M4A/AAC/OGG) to a raw
// AudioBuffer via the Web Audio API. No library needed for decoding.
//
// Memory note: decodeAudioData expands the whole file to float32 PCM in RAM
// (a 4-min stereo track ≈ 80 MB). We convert sequentially to limit peak use.

let ctx: AudioContext | OfflineAudioContext | null = null;

function audioContext(): BaseAudioContext {
  if (!ctx) {
    const Ctor =
      globalThis.AudioContext ?? (globalThis as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new Ctor();
  }
  return ctx;
}

export async function decodeAudio(file: File): Promise<AudioBuffer> {
  const arrayBuffer = await file.arrayBuffer();
  // decodeAudioData detaches the buffer; that's fine, we don't reuse it.
  return audioContext().decodeAudioData(arrayBuffer);
}
