// Minimal types for wasm-media-encoders (the package ships only an `any` UMD
// declaration). We use the Ogg Vorbis encoder; the Opus wasm isn't in this lib.
declare module 'wasm-media-encoders' {
  interface MediaEncoder {
    configure(options: {
      channels: number;
      sampleRate: number;
      vbrQuality?: number;
      bitrate?: number;
    }): void;
    /** Encode interleaved-by-channel float samples. Returned buffer is owned by
     *  the encoder and MUST be copied before the next call. */
    encode(samples: Float32Array[]): Uint8Array;
    finalize(): Uint8Array;
  }
  export function createOggEncoder(): Promise<MediaEncoder>;
  export function createMp3Encoder(): Promise<MediaEncoder>;
}
