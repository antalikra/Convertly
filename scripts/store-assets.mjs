// Builds the Chrome Web Store assets from the real extension UI (dist/, run `npm run build` first):
//   store/screenshot-1..5.png (1280×800), store/tile-440x280.png, store/marquee-1400x560.png,
//   store/icon-128.png, store/demo.mp4 (30 s, H.264).
// The window is captured with Playwright (Chromium + the built extension). Demo photos are painted
// on a canvas and encoded to HEIC with the Windows HEIF codec (scripts/lib/heic-encode.ps1), since
// browsers cannot write HEIC. Frames and captions are HTML/CSS rendered by Playwright; the video is
// encoded with WebCodecs (H.264) in the installed Google Chrome and muxed by scripts/lib/mp4.mjs.
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { muxH264 } from './lib/mp4.mjs';

const require = createRequire(import.meta.url);
const ROOT = process.cwd();
const DIST = path.join(ROOT, 'dist');
const STORE = path.join(ROOT, 'store');
const TMP = path.join(ROOT, '.tmp', 'store');
const CAP = path.join(TMP, 'captures');
const SAMPLES = path.join(TMP, 'samples');
const PORT = 5181;
const BASE = `http://127.0.0.1:${PORT}`;
const W = 880; // the window's default width (src/background.ts)
const H = 700;
const BAR = 34; // drawn window title bar
const FONT = "'Segoe UI', system-ui, -apple-system, Roboto, sans-serif";

const PHOTOS = [
  ['IMG_4127', '#1e3c72', '#f8b195', '#f67280', 0.62],
  ['IMG_4128', '#0f2027', '#2c5364', '#a8e6cf', 0.55],
  ['IMG_4131', '#355c7d', '#c06c84', '#f8b195', 0.58],
  ['IMG_4135', '#141e30', '#243b55', '#ffd194', 0.66],
  ['IMG_4136', '#4b6cb7', '#dce35b', '#45b649', 0.6],
  ['IMG_4140', '#2b5876', '#4e4376', '#ffafbd', 0.57],
  ['IMG_4142', '#3a6186', '#89253e', '#f7b733', 0.63],
  ['IMG_4147', '#16222a', '#3a6073', '#e0eafc', 0.52],
];
const AUDIO = [['Lecture 03.wav', 48, 220], ['Voice memo 0912.wav', 21, 330], ['Podcast intro.wav', 33, 262]];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// ---------------------------------------------------------------------------------------------
// 0. A static server for the composer pages (captures, icons) and the encoder page

function serve() {
  const types = { '.png': 'image/png', '.html': 'text/html', '.mp4': 'video/mp4', '.js': 'text/javascript' };
  const server = createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, BASE).pathname);
    // Composer pages start from this origin so they may load the captures.
    if (pathname === '/blank') return res.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html>');
    const file = path.join(ROOT, pathname);
    if (!file.startsWith(ROOT) || !existsSync(file)) return res.writeHead(404).end();
    res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  return new Promise((r) => server.listen(PORT, '127.0.0.1', () => r(server)));
}
const url = (file) => `${BASE}/${path.relative(ROOT, file).split(path.sep).join('/')}`;

// ---------------------------------------------------------------------------------------------
// 1. Demo files: HEIC photos, WAV recordings, PDFs and a DOCX

async function makeSamples(browser) {
  mkdirSync(SAMPLES, { recursive: true });
  const page = await browser.newPage();
  for (const [name, a, c, d, horizon] of PHOTOS) {
    const heic = path.join(SAMPLES, `${name}.HEIC`);
    if (existsSync(heic)) continue;
    const b64 = await page.evaluate(
      async ([a, c, d, horizon, seed]) => {
        // A landscape at the iPhone's 12 MP with detail at every scale (clouds, ridges, foliage,
        // grass, sensor grain), so converted and resized sizes come out like a real photo's.
        const w = 4032, h = 3024;
        const cv = new OffscreenCanvas(w, h);
        const g = cv.getContext('2d');
        let s = seed;
        const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
        const hex = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16));
        const mix = (p, q, t) => p.map((v, i) => Math.round(v + (q[i] - v) * t));
        const rgba = (c, al) => `rgba(${c[0]},${c[1]},${c[2]},${al})`;
        const sky = g.createLinearGradient(0, 0, 0, h * horizon);
        sky.addColorStop(0, a);
        sky.addColorStop(0.6, c);
        sky.addColorStop(1, d);
        g.fillStyle = sky;
        g.fillRect(0, 0, w, h);
        g.filter = 'blur(28px)';
        for (let i = 0; i < 90; i++) {
          g.fillStyle = `rgba(255,255,255,${0.05 + rnd() * 0.12})`;
          g.beginPath();
          g.ellipse(rnd() * w, rnd() * h * horizon * 0.8, 120 + rnd() * 360, 30 + rnd() * 90, 0, 0, 7);
          g.fill();
        }
        g.filter = 'none';
        g.fillStyle = 'rgba(255,240,200,.85)';
        g.beginPath();
        g.arc(w * (0.2 + rnd() * 0.6), h * horizon * 0.7, 210, 0, 7);
        g.fill();
        const base = hex(d);
        for (let layer = 0; layer < 4; layer++) {
          const y0 = h * (horizon - 0.06 + layer * 0.08);
          const col = mix([20 + layer * 18, 30 + layer * 22, 45 + layer * 8], base, 0.15);
          g.fillStyle = rgba(col, 0.8 + layer * 0.05);
          g.beginPath();
          g.moveTo(0, h);
          const ridge = [];
          for (let x = 0; x <= w; x += 24) {
            const y = y0 - Math.sin(x / (320 + layer * 150) + layer) * (190 - layer * 30) - Math.sin(x / 61 + layer * 3) * 22 - rnd() * 26;
            ridge.push([x, y]);
            g.lineTo(x, y);
          }
          g.lineTo(w, h);
          g.closePath();
          g.fill();
          // Trees and rocks along each ridge.
          for (let i = 0; i < 2600; i++) {
            const [x, y] = ridge[Math.floor(rnd() * ridge.length)];
            const dy = rnd() * 260;
            g.fillStyle = rgba(mix(col, [rnd() * 60, 40 + rnd() * 90, rnd() * 50], 0.35 + rnd() * 0.4), 0.55);
            g.beginPath();
            g.ellipse(x + (rnd() - 0.5) * 30, y + dy, 6 + rnd() * 18, 10 + rnd() * 34, 0, 0, 7);
            g.fill();
          }
        }
        // Grass in the foreground.
        g.lineWidth = 3;
        for (let i = 0; i < 26000; i++) {
          const x = rnd() * w;
          const y = h * 0.82 + rnd() * h * 0.2;
          g.strokeStyle = `rgba(${40 + rnd() * 80},${70 + rnd() * 100},${20 + rnd() * 40},0.7)`;
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x + (rnd() - 0.5) * 22, y - 18 - rnd() * 46);
          g.stroke();
        }
        const img = g.getImageData(0, 0, w, h);
        const px = img.data;
        for (let k = 0; k < px.length; k += 4) {
          const n = (rnd() - 0.5) * 8;
          px[k] += n;
          px[k + 1] += n;
          px[k + 2] += n;
        }
        g.putImageData(img, 0, 0);
        const bytes = new Uint8Array(await (await cv.convertToBlob({ type: 'image/png' })).arrayBuffer());
        let bin = '';
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        return btoa(bin);
      },
      [a, c, d, horizon, PHOTOS.findIndex((p) => p[0] === name) * 7919 + 17],
    );
    const png = path.join(SAMPLES, `${name}.png`);
    writeFileSync(png, Buffer.from(b64, 'base64'));
    execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(ROOT, 'scripts', 'lib', 'heic-encode.ps1'), '-Src', png, '-Dir', SAMPLES, '-Name', `${name}.HEIC`], { stdio: 'inherit' });
    rmSync(png);
  }
  await page.close();

  for (const [name, seconds, hz] of AUDIO) {
    const file = path.join(SAMPLES, name);
    if (existsSync(file)) continue;
    const rate = 44100;
    const n = rate * seconds;
    const b = Buffer.alloc(44 + n * 4);
    b.write('RIFF', 0, 'latin1');
    b.writeUInt32LE(36 + n * 4, 4);
    b.write('WAVEfmt ', 8, 'latin1');
    b.writeUInt32LE(16, 16);
    b.writeUInt16LE(1, 20);
    b.writeUInt16LE(2, 22);
    b.writeUInt32LE(rate, 24);
    b.writeUInt32LE(rate * 4, 28);
    b.writeUInt16LE(4, 32);
    b.writeUInt16LE(16, 34);
    b.write('data', 36, 'latin1');
    b.writeUInt32LE(n * 4, 40);
    for (let i = 0; i < n; i++) {
      const t = i / rate;
      const v = Math.round((Math.sin(t * 2 * Math.PI * hz) + 0.5 * Math.sin(t * 2 * Math.PI * hz * 1.5)) * 5000 * (0.6 + 0.4 * Math.sin(t * 3)));
      b.writeInt16LE(v, 44 + i * 4);
      b.writeInt16LE(v, 46 + i * 4);
    }
    writeFileSync(file, b);
  }

  const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
  for (const [name, pages] of [['Lease agreement.pdf', 6], ['Invoice 0142.pdf', 2], ['Receipt scan.pdf', 1], ['Bank statement.pdf', 3]]) {
    const file = path.join(SAMPLES, name);
    if (existsSync(file)) continue;
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    for (let i = 1; i <= pages; i++) {
      const p = doc.addPage([595, 842]);
      p.drawText(`${name.replace('.pdf', '')} — page ${i}`, { x: 60, y: 760, size: 20, font, color: rgb(0.1, 0.1, 0.3) });
      for (let l = 0; l < 32; l++) p.drawText('Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor.', { x: 60, y: 710 - l * 19, size: 10.5, font });
    }
    writeFileSync(file, await doc.save());
  }
  const docx = path.join(SAMPLES, 'Meeting notes.docx');
  if (!existsSync(docx)) {
    const { zipSync, strToU8 } = require('fflate');
    const body = ['Meeting notes', 'Agenda: budget, hiring, launch plan.', 'Next steps are listed below.']
      .map((t) => `<w:p><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`)
      .join('');
    writeFileSync(
      docx,
      zipSync({
        '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
        '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
        'word/document.xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`),
      }),
    );
  }
}

// ---------------------------------------------------------------------------------------------
// 2. Capture the real window

async function captureUI() {
  rmSync(CAP, { recursive: true, force: true });
  mkdirSync(CAP, { recursive: true });
  const ctx = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    deviceScaleFactor: 2,
    viewport: { width: W, height: H },
    locale: 'en-US',
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`, '--lang=en-US'],
  });
  const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker'));
  // The one-time rating request would sit on top of every later capture.
  await sw.evaluate(() => chrome.storage.local.set({ 'convertly.settings': { ratePromptDone: true } }));
  const app = await ctx.newPage();
  await app.goto(`chrome-extension://${new URL(sw.url()).host}/app.html`);
  await app.locator('.dropzone').waitFor();
  const meta = {};
  const center = async (locator) => {
    const b = await locator.boundingBox();
    return [Math.round(b.x + b.width / 2), Math.round(b.y + b.height / 2)];
  };
  const shot = async (name, extra = {}) => {
    await sleep(350); // pills and rows finish their animations
    writeFileSync(path.join(CAP, `${name}.png`), await app.screenshot());
    meta[name] = extra;
  };
  const settle = async () => {
    await app.waitForFunction(() => !document.body.classList.contains('is-busy') && !document.querySelector('.fileitem .spinner'), null, { timeout: 300_000 });
  };
  const files = (names) => names.map((n) => path.join(SAMPLES, n));
  /** Scrolls the window's content to the end, where the file list (and any result) is. */
  const scrollList = () => app.locator('.content').evaluate((el) => el.scrollTo(0, el.scrollHeight));

  await app.mouse.move(W - 2, H - 2);
  await shot('empty', { cursor: await center(app.locator('.dropzone__icon')) });

  await app.setInputFiles('.dropzone input', files(PHOTOS.map((p) => `${p[0]}.HEIC`)));
  await app.locator('.fileitem').nth(PHOTOS.length - 1).waitFor();
  await scrollList();
  await shot('queued', { cursor: await center(app.locator('[data-convert]')) });

  await app.locator('[data-convert]').click();
  await app.mouse.move(W - 2, H - 2);
  // A frame mid-way: a few done, a few still running.
  await app.waitForFunction(() => document.querySelectorAll('.badge--success').length >= 3 && document.querySelectorAll('.fileitem .spinner').length >= 1, null, { timeout: 120_000, polling: 50 });
  writeFileSync(path.join(CAP, 'converting.png'), await app.screenshot());
  meta.converting = {};
  await settle();
  await scrollList();
  await shot('done', { cursor: await center(app.locator('[data-zip]')) });

  // Formats: smaller WebP files for the web, capped at 1920 px, one photo kept as PNG.
  await app.locator('[data-seg="image"] [data-fmt="webp"]').click();
  await app.locator('#quality').evaluate((el) => {
    el.value = '0.8';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await app.locator('[data-resizemode="maxside"]').click();
  await app.locator('[data-resizemax="1920"]').click();
  await app.locator('[data-convert]').click();
  await settle();
  await scrollList();
  await app.locator('.fileitem').nth(1).locator('.fmt-select:not(.grp-select) .fmt-select__trigger').click();
  await app.locator('.fileitem').nth(1).locator('.fmt-select:not(.grp-select) .fmt-select__opt', { hasText: 'PNG' }).hover();
  await shot('formats', { cursor: await center(app.locator('.fileitem').nth(1).locator('.fmt-select:not(.grp-select) .fmt-select__opt', { hasText: 'PNG' })) });
  await app.keyboard.press('Escape');

  // Documents: four PDFs merged into one.
  await app.locator('[data-clear]').click();
  await app.locator('[data-tab="pdf"]').click();
  await app.setInputFiles('.dropzone input', files(['Lease agreement.pdf', 'Invoice 0142.pdf', 'Receipt scan.pdf', 'Bank statement.pdf']));
  await app.locator('.fileitem').nth(3).waitFor();
  await app.locator('[data-pdfop-seg] [data-op="merge"]').click();
  await app.locator('[data-convert]').click();
  await settle();
  await app.mouse.move(W - 2, H - 2);
  await scrollList();
  await shot('docs', { cursor: await center(app.locator('[data-slot="result"] button[title="Download"]')) });

  // Audio: WAV recordings to MP3, volume evened out.
  await app.locator('[data-clear]').click();
  await app.locator('[data-tab="media"]').click();
  await app.setInputFiles('.dropzone input', files(AUDIO.map((a) => a[0])));
  await app.locator('.fileitem').nth(AUDIO.length - 1).waitFor();
  await app.locator('[data-audionorm="on"]').click();
  await app.locator('[data-convert]').click();
  await settle();
  await app.mouse.move(W - 2, H - 2);
  await scrollList();
  await shot('audio');

  writeFileSync(path.join(CAP, 'meta.json'), JSON.stringify(meta, null, 2));
  await ctx.close();
  return meta;
}

// ---------------------------------------------------------------------------------------------
// 3. Layouts (HTML/CSS) rendered by Playwright

const ICON = () => url(path.join(ROOT, 'scripts', 'promo', 'mark.png'));
const BG = 'radial-gradient(900px 520px at 0% 0%,#e3e2ff 0%,transparent 62%),radial-gradient(800px 520px at 100% 100%,#efe4ff 0%,transparent 60%),#f5f4fa';

function windowHtml(name, { left, top, scale }) {
  return `
  <div class="win" style="left:${left}px;top:${top}px;width:${Math.round(W * scale)}px">
    <div class="bar"><span class="dots"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i></span><span class="title">Convertly</span></div>
    <img class="ui" src="${url(path.join(CAP, `${name}.png`))}" style="width:${Math.round(W * scale)}px;height:${Math.round(H * scale)}px" alt="">
  </div>`;
}
const WINDOW_CSS = `
  .win{position:absolute;border-radius:14px;overflow:hidden;background:#15151c;
       box-shadow:0 30px 80px rgba(36,30,90,.32),0 0 0 1px rgba(20,20,40,.18)}
  .bar{height:${BAR}px;display:flex;align-items:center;padding:0 14px;background:#22222c;border-bottom:1px solid #30303c;position:relative}
  .dots i{display:inline-block;width:12px;height:12px;border-radius:50%;margin-right:7px}
  .title{position:absolute;left:0;right:0;text-align:center;color:#c9c9d6;font-size:13px;font-weight:600;pointer-events:none}
  .ui{display:block}`;

const SHOT_SCALE = 0.89;
const SHOT_WIN = { left: 1280 - 40 - Math.round(W * SHOT_SCALE), top: Math.round((800 - BAR - H * SHOT_SCALE) / 2), scale: SHOT_SCALE };

function sideText(title, sub, bullets) {
  return `<div class="side">
    <div class="brand"><img src="${ICON()}" alt=""><span>Convertly</span></div>
    <h1>${esc(title)}</h1><p>${esc(sub)}</p>
    <ul>${bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>
  </div>`;
}
const SIDE_CSS = `
  .side{position:absolute;left:56px;top:0;bottom:0;width:${SHOT_WIN.left - 96}px;display:flex;flex-direction:column;justify-content:center}
  .brand{display:flex;align-items:center;gap:10px;font-size:19px;font-weight:700;color:#3d3f9e;margin-bottom:22px}
  .brand img{width:34px;height:34px}
  h1{margin:0;font-size:38px;line-height:1.12;color:#111118;letter-spacing:-.02em;font-weight:800}
  p{margin:16px 0 0;font-size:18px;line-height:1.45;color:#3b4252}
  ul{margin:26px 0 0;padding:0;list-style:none;font-size:16.5px;line-height:2;color:#1f2330;font-weight:600}
  li::before{content:"✓";display:inline-block;width:26px;color:#5c60db;font-weight:800}`;

function screenshotHtml(name, title, sub, bullets) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;width:1280px;height:800px;overflow:hidden;font-family:${FONT};background:${BG}}
  ${SIDE_CSS}${WINDOW_CSS}
  </style></head><body>${sideText(title, sub, bullets)}${windowHtml(name, SHOT_WIN)}</body></html>`;
}

const STAGE_SCALE = 0.86;
const STAGE_WIN = { left: 1280 - 36 - Math.round(W * STAGE_SCALE), top: Math.round((720 - BAR - H * STAGE_SCALE) / 2), scale: STAGE_SCALE };

function stageHtml(name, step, caption) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;width:1280px;height:720px;overflow:hidden;font-family:${FONT};background:${BG}}
  ${WINDOW_CSS}
  .cap{position:absolute;left:52px;top:0;bottom:0;width:${STAGE_WIN.left - 84}px;display:flex;flex-direction:column;justify-content:center}
  .step{font-size:15px;font-weight:700;color:#5c60db;letter-spacing:.08em;text-transform:uppercase;margin-bottom:12px}
  .cap h1{margin:0;font-size:34px;line-height:1.15;color:#111118;letter-spacing:-.02em;font-weight:800}
  .cap b{color:#5c60db}
  </style></head><body>
  <div class="cap"><div class="step">${esc(step)}</div><h1>${caption}</h1></div>
  ${windowHtml(name, STAGE_WIN)}
  </body></html>`;
}

function cardHtml(kind) {
  const start = kind === 'start';
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;width:1280px;height:720px;overflow:hidden;font-family:${FONT}}
  body{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;color:#fff;
       background:radial-gradient(900px 500px at 20% 0%,#6d71f5 0%,transparent 60%),linear-gradient(135deg,#5c60db 0%,#4a4cc0 55%,#2f3080 100%)}
  img{width:132px;height:132px;filter:drop-shadow(0 16px 30px rgba(0,0,0,.35))}
  h1{margin:0;font-size:66px;font-weight:800;letter-spacing:-.03em}
  p{margin:0;font-size:31px;font-weight:600;opacity:.96}
  small{font-size:21px;opacity:.82}
  </style></head><body><img src="${ICON()}" alt="">
  <h1>Convertly</h1>
  <p>${start ? 'HEIC to JPG — right in your browser' : 'Free · Private · Works offline'}</p>
  <small>${start ? 'Nothing is uploaded' : 'HEIC · JPG · PNG · WebP · AVIF · PDF · MP3'}</small></body></html>`;
}

function tileHtml() {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;width:440px;height:280px;overflow:hidden;font-family:${FONT}}
  body{display:flex;align-items:center;gap:22px;padding:0 30px;box-sizing:border-box;color:#111118;background:${BG}}
  img{width:118px;height:118px;flex:none;filter:drop-shadow(0 12px 20px rgba(92,96,219,.32))}
  h1{margin:0;font-size:34px;font-weight:800;letter-spacing:-.02em}
  .big{margin:6px 0 0;font-size:30px;font-weight:800;color:#5c60db;letter-spacing:-.01em}
  .sub{margin:8px 0 0;font-size:16px;font-weight:600;color:#3b4252}
  </style></head><body><img src="${ICON()}" alt=""><div><h1>Convertly</h1><div class="big">HEIC → JPG</div><div class="sub">In your browser · No uploads</div></div></body></html>`;
}

function marqueeHtml() {
  const scale = 0.7;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;width:1400px;height:560px;overflow:hidden;font-family:${FONT}}
  body{color:#fff;background:radial-gradient(900px 500px at 15% 0%,#6d71f5 0%,transparent 60%),linear-gradient(120deg,#5c60db 0%,#4a4cc0 55%,#2f3080 100%)}
  .left{position:absolute;left:70px;top:0;bottom:0;width:560px;display:flex;flex-direction:column;justify-content:center}
  .brand{display:flex;align-items:center;gap:16px}
  .brand img{width:78px;height:78px;filter:drop-shadow(0 10px 20px rgba(0,0,0,.3))}
  h1{margin:0;font-size:54px;font-weight:800;letter-spacing:-.03em}
  h2{margin:26px 0 22px;font-size:33px;line-height:1.2;font-weight:700}
  ul{margin:0;padding:0;list-style:none;font-size:21px;line-height:1.9;opacity:.96}
  li::before{content:"✓";display:inline-block;width:32px;color:#fcd34d;font-weight:800}
  ${WINDOW_CSS}
  </style></head><body>
  <div class="left"><div class="brand"><img src="${ICON()}" alt=""><h1>Convertly</h1></div>
  <h2>Convert iPhone HEIC photos to JPG,<br>right in your browser</h2>
  <ul><li>Nothing is uploaded, works offline</li><li>Batches of up to 200 photos</li><li>Plus PNG, WebP, AVIF, PDF and MP3</li></ul></div>
  ${windowHtml('done', { left: 1400 - 50 - Math.round(W * scale), top: Math.round((560 - BAR - H * scale) / 2), scale })}
  </body></html>`;
}

async function render(browser, html, file, width, height) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.goto(`${BASE}/blank`);
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => Promise.all(Array.from(document.images, (i) => (i.complete ? null : new Promise((r) => { i.onload = r; i.onerror = r; })))));
  writeFileSync(file, await page.screenshot({ clip: { x: 0, y: 0, width, height } }));
  await page.close();
}

// ---------------------------------------------------------------------------------------------
// 4. Video: keyframes + cursor animation, H.264 via WebCodecs, MP4 via scripts/lib/mp4.mjs

const toStage = ([x, y]) => [STAGE_WIN.left + x * STAGE_SCALE, STAGE_WIN.top + BAR + y * STAGE_SCALE];

function timeline(meta) {
  const segs = [
    { img: 'card-start', start: 0 },
    { img: 'empty', start: 2.6, drag: true },
    { img: 'queued', start: 6.4, click: true },
    { img: 'converting', start: 9.2 },
    { img: 'done', start: 11.0, click: true },
    { img: 'formats', start: 15.0, click: true },
    { img: 'docs', start: 19.2, click: true },
    { img: 'audio', start: 23.2 },
    { img: 'card-end', start: 26.6 },
  ];
  let last = [330, 560];
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    const end = i + 1 < segs.length ? segs[i + 1].start : 30;
    const m = meta[s.img];
    if (m && m.cursor) {
      const to = toStage(m.cursor);
      const moveStart = s.start + 0.45;
      const clickAt = s.click ? end - 0.35 : null;
      const moveEnd = s.click ? clickAt - 0.25 : s.drag ? end - 0.8 : Math.min(end - 0.4, moveStart + 1.3);
      s.cursor = { from: s.drag ? [150, 640] : last, to, moveStart, moveEnd, click: clickAt, drag: !!s.drag };
      last = to;
    } else if (m) {
      s.cursor = { from: last, to: last, moveStart: s.start, moveEnd: s.start + 0.01, click: null };
    }
  }
  return segs;
}

const ENCODER_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>encoder</title></head><body><script>
window.encodeDemo = async (segs, W, H, FPS, SECONDS, CAP) => {
  const names = [...new Set(segs.map((s) => s.img))];
  const imgs = {};
  for (const n of names) imgs[n] = await createImageBitmap(await (await fetch(CAP + '/stage-' + n + '.png')).blob());
  const canvas = new OffscreenCanvas(W, H);
  const g = canvas.getContext('2d');
  const ease = (p) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
  const clamp = (x) => Math.max(0, Math.min(1, x));
  function pointer(x, y) {
    g.save();
    g.translate(x, y);
    g.scale(1.35, 1.35);
    g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 6; g.shadowOffsetY = 2;
    g.beginPath();
    g.moveTo(0, 0); g.lineTo(0, 17); g.lineTo(4.2, 13); g.lineTo(7, 19.5); g.lineTo(9.6, 18.4); g.lineTo(6.9, 12.2); g.lineTo(12.3, 12.2); g.closePath();
    g.fillStyle = '#fff'; g.fill();
    g.shadowColor = 'transparent';
    g.lineWidth = 1.3; g.strokeStyle = '#111'; g.stroke();
    g.restore();
  }
  function card(x, y, label) {
    g.fillStyle = '#ffffff';
    g.strokeStyle = 'rgba(30,30,60,.25)';
    g.lineWidth = 1;
    g.beginPath(); g.roundRect(x, y, 128, 84, 10); g.fill(); g.stroke();
    g.fillStyle = '#5c60db';
    g.beginPath(); g.roundRect(x + 10, y + 10, 44, 30, 6); g.fill();
    g.fillStyle = '#fff'; g.font = '700 12px Segoe UI, sans-serif'; g.fillText('HEIC', x + 17, y + 30);
    g.fillStyle = '#1f2330'; g.font = '600 12.5px Segoe UI, sans-serif'; g.fillText(label, x + 10, y + 64);
  }
  function files(x, y, alpha) {
    g.save();
    g.globalAlpha = alpha;
    g.shadowColor = 'rgba(40,30,90,.3)'; g.shadowBlur = 16; g.shadowOffsetY = 6;
    card(x + 22, y + 14, 'IMG_4135.HEIC');
    card(x + 14, y + 8, 'IMG_4131.HEIC');
    card(x + 6, y + 2, 'IMG_4127.HEIC');
    g.shadowColor = 'transparent';
    g.fillStyle = '#e5484d';
    g.beginPath(); g.arc(x + 138, y + 6, 15, 0, 7); g.fill();
    g.fillStyle = '#fff'; g.font = '700 15px Segoe UI, sans-serif'; g.fillText('8', x + 133, y + 11);
    g.restore();
  }
  function draw(t) {
    let i = 0;
    while (i + 1 < segs.length && t >= segs[i + 1].start) i++;
    const s = segs[i];
    g.globalAlpha = 1;
    g.drawImage(imgs[s.img], 0, 0, W, H);
    const fade = 0.35;
    if (i > 0 && t - s.start < fade) {
      g.globalAlpha = 1 - ease(clamp((t - s.start) / fade));
      g.drawImage(imgs[segs[i - 1].img], 0, 0, W, H);
      g.globalAlpha = 1;
    }
    const c = s.cursor;
    if (!c) return;
    const p = ease(clamp((t - c.moveStart) / Math.max(0.01, c.moveEnd - c.moveStart)));
    const x = c.from[0] + (c.to[0] - c.from[0]) * p;
    const y = c.from[1] + (c.to[1] - c.from[1]) * p;
    if (c.drag) {
      // Photos dragged in from the desktop; they drop when the pointer reaches the window.
      const dropped = clamp((t - c.moveEnd) / 0.35);
      if (dropped < 1) files(x - 70, y - 20, 1 - dropped);
    }
    if (c.click !== null && t >= c.click && t < c.click + 0.5) {
      const q = (t - c.click) / 0.5;
      g.beginPath();
      g.arc(x, y, 8 + 26 * q, 0, Math.PI * 2);
      g.fillStyle = 'rgba(98,102,239,' + (0.35 * (1 - q)) + ')';
      g.fill();
    }
    pointer(x, y);
  }
  const chunks = [];
  let description = null;
  let failure = null;
  const enc = new VideoEncoder({
    output: (chunk, meta) => {
      const b = new Uint8Array(chunk.byteLength);
      chunk.copyTo(b);
      chunks.push({ ts: chunk.timestamp, key: chunk.type === 'key', data: b });
      const d = meta && meta.decoderConfig && meta.decoderConfig.description;
      if (d && !description) description = new Uint8Array(ArrayBuffer.isView(d) ? d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength) : d.slice(0));
    },
    error: (e) => { failure = e.message; },
  });
  enc.configure({ codec: 'avc1.42e01f', width: W, height: H, bitrate: 6000000, framerate: FPS, avc: { format: 'avc' }, latencyMode: 'quality', hardwareAcceleration: 'prefer-software' });
  const N = FPS * SECONDS;
  for (let i = 0; i < N; i++) {
    draw(i / FPS);
    const frame = new VideoFrame(canvas, { timestamp: Math.round((i * 1e6) / FPS), duration: Math.round(1e6 / FPS) });
    enc.encode(frame, { keyFrame: i % (FPS * 2) === 0 });
    frame.close();
    while (enc.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 1));
  }
  await enc.flush();
  enc.close();
  if (failure) throw new Error(failure);
  const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  return { description: b64(description), chunks: chunks.map((c) => ({ ts: c.ts, key: c.key, data: b64(c.data) })) };
};
window.checkVideo = async (src) => {
  // Frames are sampled while the file plays: a seek in headless Chrome keeps showing the first frame.
  const v = document.createElement('video');
  v.muted = true;
  v.src = src;
  document.body.append(v);
  await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error('video error ' + (v.error && v.error.message))); });
  const want = { titleCard: 1, uiScene: 13 };
  const out = {};
  const leftQuarter = () => {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 36;
    const g = c.getContext('2d');
    g.drawImage(v, 0, 0, 64, 36);
    const px = g.getImageData(0, 0, 16, 36).data;
    let sum = 0;
    for (let i = 0; i < px.length; i += 4) sum += px[i] + px[i + 1] + px[i + 2];
    return Math.round(sum / (px.length / 4) / 3);
  };
  await new Promise((done) => {
    const onFrame = (now, meta) => {
      for (const [k, t] of Object.entries(want)) if (!(k in out) && meta.mediaTime >= t) out[k] = leftQuarter();
      if (Object.keys(out).length === Object.keys(want).length) return done();
      v.requestVideoFrameCallback(onFrame);
    };
    v.requestVideoFrameCallback(onFrame);
    v.onended = done;
    v.playbackRate = 4;
    v.play();
  });
  v.pause();
  return { duration: v.duration, width: v.videoWidth, height: v.videoHeight, ...out };
};
</script></body></html>`;

async function makeVideo(meta, composer) {
  const [Wv, Hv, FPS, SECONDS] = [1280, 720, 30, 30];
  const scenes = {
    empty: ['Step 1', 'Drop your <b>HEIC</b> photos into the window'],
    queued: ['Step 2', 'Click <b>Convert</b>'],
    converting: ['Step 2', 'Converted <b>on your computer</b> — nothing is uploaded'],
    done: ['Step 3', 'Download one by one or as a <b>ZIP</b>'],
    formats: ['Formats', 'JPG, PNG, <b>WebP</b>, AVIF — with quality and size'],
    docs: ['Documents', '<b>PDF tools</b>: merge, split, rotate, compress'],
    audio: ['Audio', 'WAV, M4A, FLAC to <b>MP3</b> or OGG'],
  };
  for (const [name, [step, caption]] of Object.entries(scenes)) await render(composer, stageHtml(name, step, caption), path.join(CAP, `stage-${name}.png`), Wv, Hv);
  await render(composer, cardHtml('start'), path.join(CAP, 'stage-card-start.png'), Wv, Hv);
  await render(composer, cardHtml('end'), path.join(CAP, 'stage-card-end.png'), Wv, Hv);
  writeFileSync(path.join(CAP, 'encoder.html'), ENCODER_HTML);

  // Google Chrome ships an H.264 encoder (Playwright's Chromium build does not).
  const chrome = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await chrome.newPage();
  await page.goto(url(path.join(CAP, 'encoder.html')));
  const out = await page.evaluate(({ segs, W: w, H: h, FPS: fps, SECONDS: sec, CAP: cap }) => window.encodeDemo(segs, w, h, fps, sec, cap), {
    segs: timeline(meta), W: Wv, H: Hv, FPS, SECONDS, CAP: url(CAP),
  });
  const samples = out.chunks.map((c) => ({ ts: c.ts, key: c.key, data: Buffer.from(c.data, 'base64') }));
  for (let i = 1; i < samples.length; i++) if (samples[i].ts <= samples[i - 1].ts) throw new Error('encoder produced out-of-order frames');
  if (samples.length !== FPS * SECONDS) throw new Error(`expected ${FPS * SECONDS} frames, got ${samples.length}`);
  const mp4 = muxH264({ width: Wv, height: Hv, fps: FPS, avcC: Buffer.from(out.description, 'base64'), samples });
  writeFileSync(path.join(STORE, 'demo.mp4'), mp4);
  writeFileSync(path.join(CAP, 'demo.mp4'), mp4);
  const check = await page.evaluate((src) => window.checkVideo(src), url(path.join(CAP, 'demo.mp4')));
  await chrome.close();
  // The title card is violet, a UI scene has a light caption column on the left: the file decodes and plays through.
  if (Math.abs(check.duration - SECONDS) > 0.1 || check.width !== Wv || check.height !== Hv || check.uiScene - check.titleCard < 60) throw new Error(`video check failed: ${JSON.stringify(check)}`);
  return { bytes: mp4.length, ...check };
}

// ---------------------------------------------------------------------------------------------

const SCREENSHOTS = [
  ['done', 'Convert iPhone HEIC photos to JPG', 'Drop your photos, click Convert, download. It takes seconds and happens right in your browser.', ['Nothing is uploaded', 'Up to 200 photos at once', 'GPS location removed']],
  ['empty', 'Your photos never leave your computer', 'Convertly converts on your device: no uploads, no account, no tracking. It even works offline.', ['No servers involved', 'Only the "storage" permission', 'Open source']],
  ['formats', 'JPG, PNG, WebP, AVIF and more', 'Pick a format for all files or for each one, set the quality and shrink big photos to a maximum size.', ['Per-file formats', 'Quality and resize', 'ZIP download']],
  ['docs', 'PDF tools built in', 'Merge, split, rotate and compress PDFs, keep or reorder pages, add page numbers, turn pages into JPG or text. Word to PDF too.', ['Merge in any order', 'Split into pages', 'Watermark and page numbers']],
  ['audio', 'Audio too: WAV, M4A, FLAC to MP3', 'Shrink recordings to MP3 or OGG. Trim them, mix to mono and even out the volume.', ['MP3 128–320 kbps', 'Trim and normalize', 'Many files at once']],
];

async function main() {
  if (!existsSync(path.join(DIST, 'manifest.json'))) throw new Error('dist/ not found — run `npm run build` first');
  mkdirSync(STORE, { recursive: true });
  const server = await serve();
  try {
    const composer = await chromium.launch();
    await makeSamples(composer);
    const meta = await captureUI();
    for (const [i, [name, title, sub, bullets]] of SCREENSHOTS.entries()) {
      await render(composer, screenshotHtml(name, title, sub, bullets), path.join(STORE, `screenshot-${i + 1}.png`), 1280, 800);
    }
    await render(composer, tileHtml(), path.join(STORE, 'tile-440x280.png'), 440, 280);
    await render(composer, marqueeHtml(), path.join(STORE, 'marquee-1400x560.png'), 1400, 560);
    copyFileSync(path.join(ROOT, 'public', 'icons', '128.png'), path.join(STORE, 'icon-128.png'));
    const video = await makeVideo(meta, composer);
    await composer.close();
    console.log('store assets written to store/:', JSON.stringify(video));
  } finally {
    server.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
