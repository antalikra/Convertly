declare module 'upng-js' {
  /** Encode RGBA frame(s) to PNG. `cnum` = 0 for lossless, else palette size
   *  (2..256) which quantises colours (lossy) for a much smaller file. */
  const UPNG: {
    encode(bufs: ArrayBuffer[], w: number, h: number, cnum: number, dels?: number[]): ArrayBuffer;
    decode(buf: ArrayBuffer): unknown;
    toRGBA8(img: unknown): ArrayBuffer[];
  };
  export default UPNG;
}
