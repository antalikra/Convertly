// Lazy loader for the heic-to decoder (bundles libheif as ~3 MB of asm.js).
//
// Two verified MV3 facts drive this (see docs/ARCHITECTURE.md "Open Risks"):
//  1. The default `heic-to` build uses `new Function`/eval → blocked by the MV3
//     CSP. We MUST import the `heic-to/csp` build (compiled without eval).
//  2. heic-to runs the actual decode in its own internal Web Worker, so we do
//     not need to manage a worker ourselves.
//
// Golden rule / PLAN §2.1: never load this at popup/app open — only on the
// first real conversion. The dynamic import is cached so it loads once.

type HeicDecoder = typeof import('heic-to/csp');

let modulePromise: Promise<HeicDecoder> | null = null;

export function loadHeicDecoder(): Promise<HeicDecoder> {
  if (!modulePromise) {
    modulePromise = import('heic-to/csp');
  }
  return modulePromise;
}
