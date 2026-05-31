import { defineManifest } from '@crxjs/vite-plugin';
import pkg from '../package.json';

// Manifest V3. Golden rule #2: minimal permissions. Files come from the user
// via drag-drop / file picker, so no host permissions are requested.
export default defineManifest({
  manifest_version: 3,
  name: 'Convertly — Image & Audio Converter',
  version: pkg.version,
  description: pkg.description,
  // No default_popup: the background worker opens a persistent window on click
  // (a dropdown popup closes on focus loss and would drop the user's files).
  action: {
    default_title: 'Convertly — open converter',
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
  web_accessible_resources: [
    {
      resources: ['app.html', 'assets/*'],
      matches: ['<all_urls>'],
    },
  ],
});
