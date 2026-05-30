# Convertly — Image & Audio Converter

A Chrome (Manifest V3) extension that converts **images and audio** fully **client-side**. No servers, no network, no accounts, no telemetry. Files never leave your device, and image GPS/EXIF metadata is dropped on the way out (re-encoding from raw pixels carries no metadata).

| Type | In | Out |
|---|---|---|
| **Images** | HEIC, HEIF, JPG, PNG, WebP, GIF, BMP, AVIF, TIFF | JPG, PNG, WebP, AVIF, TIFF, BMP |
| **Audio** | MP3, WAV, FLAC, M4A, AAC, OGG | WAV, MP3 |

## Why

Browsers can't decode HEIC natively (not even Safari), so most converters skip it. Convertly decodes HEIC with a bundled build of libheif (`heic-to`, shipped as asm.js) and re-encodes through the canvas. AVIF/TIFF/PNG-optimise and MP3 use small bundled codecs; everything else uses built-in browser APIs (`createImageBitmap`, `OffscreenCanvas.convertToBlob`, Web Audio `decodeAudioData`). All in the browser.

## Entry model

Clicking the toolbar icon does **not** open a dropdown popup (a popup closes on focus loss — e.g. the OS file picker — and would drop your files mid-job). Instead `src/background.ts` opens a persistent **window** loading `app.html`. If a Convertly window is already open, it is focused.

## Develop

```bash
npm install
npm run dev      # vite dev server (load unpacked from the build dir)
npm run build    # typecheck (tsc --noEmit) + production build → dist/
npm run zip      # package dist/ → release/convertly-<version>.zip
npm run test     # unit tests (Vitest)
```

Load unpacked: `chrome://extensions` → Developer mode → Load unpacked → `dist/`.

## Dependencies (all bundled locally, no CDN)

| Package | Use | Licence |
|---|---|---|
| `heic-to` (`/csp` build) | HEIC/HEIF decode (libheif/libde265) | LGPL-3.0 |
| `@jsquash/avif` | AVIF encode (WASM) | Apache-2.0 |
| `utif2` | TIFF decode + encode | MIT |
| `upng-js` (+ `pako`) | PNG encode (quality = palette quantisation) | MIT |
| `@breezystack/lamejs` | MP3 encode | LGPL-3.0 |
| `fflate` | ZIP batch download | MIT |

The LGPL-3.0 libraries (`heic-to`/libheif/libde265, `lamejs`) are shipped unmodified; keep their notices in the store listing.

## Architecture

Five layers — `ui → app → core → infra` (+ `shared`) — communicating via plain data types. Features are added through a **Tool + Registry** pattern: a new format/tool is a new `Tool` object plus one line in `registerTools.ts`.

## Privacy

All processing is local. No data is collected, transmitted, or stored. No network requests. The only outbound links are the user-clicked Ko-fi/PayPal support links (open in a new tab).
