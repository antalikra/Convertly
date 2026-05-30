import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { crx } from '@crxjs/vite-plugin';
import manifest from './src/manifest.config';

export default defineConfig({
  resolve: {
    alias: {
      '@core': resolve(__dirname, 'src/core'),
      '@app': resolve(__dirname, 'src/app'),
      '@infra': resolve(__dirname, 'src/infra'),
      '@ui': resolve(__dirname, 'src/ui'),
      '@shared': resolve(__dirname, 'src/shared'),
    },
  },
  // @jsquash/avif references a multi-threaded worker; Vite's default IIFE worker
  // format can't be code-split. ES worker format fixes the build. (At runtime the
  // MV3 extension window IS cross-origin-isolated, so wasm-feature-detect's
  // threads() is true and AVIF actually uses this mt worker — verified in Chrome
  // 2026-05-30. Single-thread avif_enc is the fallback.)
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    rollupOptions: {
      // app.html is the converter UI the background worker opens. crxjs only
      // copies web_accessible_resources HTML verbatim (it does NOT bundle the
      // <script>), so app.html must be a real rollup input or its module stays
      // an unbundled /src ref. (app.html carries no inline <style> — that used
      // to race the crxjs inline-CSS html proxy into intermittent build fails.)
      input: {
        app: resolve(__dirname, 'app.html'),
      },
    },
  },
  plugins: [crx({ manifest })],
});
