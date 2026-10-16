import { defineManifest } from '@crxjs/vite-plugin';
import pkg from '../package.json';

// Manifest V3. Golden rule #2: minimal permissions. Files come from the user
// via drag-drop / file picker, so no host permissions are requested.
// Name, description and button title come from public/_locales (generated from
// src/i18n by scripts/locales.mjs), so the store listing is localised too.
export default defineManifest({
  manifest_version: 3,
  name: '__MSG_extName__',
  short_name: 'Convertly',
  version: pkg.version,
  description: '__MSG_extDescription__',
  default_locale: 'en',
  // No default_popup: the background worker opens a persistent window on click
  // (a dropdown popup closes on focus loss and would drop the user's files).
  action: {
    default_title: '__MSG_actionTitle__',
  },
  background: {
    service_worker: 'src/background.ts',
    type: 'module',
  },
  icons: {
    16: 'icons/16.png',
    32: 'icons/32.png',
    48: 'icons/48.png',
    128: 'icons/128.png',
  },
  permissions: ['storage'],
  // We import `heic-to/csp` (built without eval) so the strict MV3 CSP is
  // satisfied. `wasm-unsafe-eval` is kept as a forward-compatible safety net in
  // case a future heic-to build switches the asm.js decoder back to real WASM.
  // OPEN RISK: heic-to spins up its decoder in a blob-URL Web Worker — verify it
  // is allowed under this CSP in a real MV3 load.
  content_security_policy: {
    extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
  },
  // No web_accessible_resources: only the extension itself opens app.html, and
  // exposing it would let any site detect that Convertly is installed.
});
