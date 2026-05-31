# Convertly — Image, Audio & Document Converter

A Chrome (Manifest V3) extension that converts **images, audio and documents** fully **client-side**. No servers, no network, no accounts, no telemetry. Files never leave your device, and image GPS/EXIF metadata is dropped on the way out (re-encoding from raw pixels carries no metadata).

| Type | In | Out |
|---|---|---|
| **Images** | HEIC, HEIF, JPG, PNG, WebP, GIF, BMP, AVIF, TIFF | JPG, PNG, WebP, AVIF, TIFF, BMP |
| **Audio** | MP3, WAV, FLAC, M4A, AAC, OGG | WAV, MP3, OGG (Vorbis) |
| **Documents** | PDF, DOCX | PDF, JPG, PNG, TXT, DOCX |

**Document operations:** PDF rotate / split / merge, PDF → JPG/PNG (per page), PDF → text, PDF → DOCX (text, Beta); images → PDF; DOCX → PDF (Beta — *Visual* raster or *Text* reflow). The toolbar splits into **Media** and **Documents** views.

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
| `wasm-media-encoders` | Ogg Vorbis encode (WASM, embedded; no eval) | MIT |
| `fflate` | ZIP batch download + DOCX (OOXML) writing | MIT |
| `pdf-lib` | PDF create / rotate / split / merge, images → PDF | MIT |
| `pdfjs-dist` | PDF → image render + text extraction | Apache-2.0 |
| `mammoth` | DOCX → HTML (for DOCX → PDF / text) | BSD-2-Clause |
| `html2canvas` | DOCX → PDF *Visual* (raster) rendering | MIT |
| `@pdf-lib/fontkit` | embed a Unicode font for reflowed PDF text | MIT |
| `@expo-google-fonts/roboto` | bundled Cyrillic-capable font (DOCX → PDF reflow) | MIT / OFL-1.1 |

The LGPL-3.0 libraries (`heic-to`/libheif/libde265, `lamejs`) are shipped unmodified; keep their notices in the store listing. The PDF/DOCX libraries are all permissive (MIT / Apache-2.0 / BSD-2-Clause) and run with no `eval` (MV3 CSP-safe): `pdf-lib`/`mammoth`/`html2canvas` are pure JS, `pdfjs-dist` uses a self-hosted worker, and the `.docx` writer hand-rolls OOXML zipped with `fflate`.

## Architecture

Five layers — `ui → app → core → infra` (+ `shared`) — communicating via plain data types. Features are added through a **Tool + Registry** pattern: a new format/tool is a new `Tool` object plus one line in `registerTools.ts`.

## Privacy

All processing is local. No data is collected, transmitted, or stored. No network requests. The only outbound links are the user-clicked Ko-fi/PayPal support links (open in a new tab).
