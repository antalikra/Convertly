// Browser entry of the website: the extension's converter, mounted with the
// page's preset. Settings live in localStorage (no chrome.* here).
import { initI18n } from '../src/i18n';
import { mountApp } from '../src/ui/mountApp';
import { loadSettings } from '../src/infra/settings';
import type { Preset } from './pages';
import { STORE_URL } from './config';
import './site.css';

const root = document.getElementById('app');

// The converter themes <body>; mirror it onto <html> so the area behind the body
// (overscroll, a full-page capture) gets the theme's colour, not white, and
// tint mobile browser chrome (theme-color) the same.
const themeColor = document.querySelector('meta[name="theme-color"]');
new MutationObserver(() => {
  document.documentElement.dataset.theme = document.body.dataset.theme;
  const bg = getComputedStyle(document.body).getPropertyValue('--bg-solid').trim();
  if (themeColor && bg) themeColor.setAttribute('content', bg);
}).observe(document.body, { attributes: true, attributeFilter: ['data-theme'] });

if (root) {
  const preset = JSON.parse(root.dataset.preset ?? '{}') as Partial<Preset>;
  // The converter speaks the page's language, not the browser's.
  void initI18n(document.documentElement.lang).then(() => {
    const controller = mountApp(root, {
      preset: preset.settings,
      tab: preset.tab,
      storeUrl: STORE_URL,
      rateAsk: false,
    });

    // The page header carries the converter's support menu and theme toggle
    // (moved, so their listeners come along); the rest of its top bar goes.
    const tools = document.querySelector('[data-header-tools]');
    const support = root.querySelector('[data-support]');
    const theme = root.querySelector('[data-theme-btn]');
    if (tools && support && theme) tools.prepend(support, theme);
    root.querySelector('.topbar')?.remove();

    // Once a batch has converted something, offer the extension where the
    // extension's own window asks for a rating.
    const offer = document.querySelector<HTMLElement>('[data-done-offer]');
    if (!offer) return;
    root.querySelector('[data-rate]')?.after(offer);
    let wasConverting = false;
    controller.subscribe((state) => {
      const converted = state.jobs.some((j) => j.outputs?.length || j.aggregated);
      if (wasConverting && !state.converting && converted) offer.hidden = false;
      wasConverting = state.converting;
    });
  });
} else {
  // Pages without the converter (404) still follow the saved theme.
  void loadSettings().then((s) => document.body.setAttribute('data-theme', s.theme));
}
