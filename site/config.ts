// Website settings: the extension's converter in a plain web page, one landing
// page per task, each leading to the Chrome Web Store listing.

/** Public address of the site (GitHub Pages project site). Its path is the build's base. */
export const SITE_URL = 'https://antalikra.github.io/Convertly/';

/** Chrome Web Store item id of the extension (32 letters a–p), shown in the
 *  developer dashboard after the first upload. Empty = not published yet: local
 *  builds warn, CI builds fail, so the site never goes out with dead store links. */
export const EXTENSION_ID = '';

export const STORE_URL = `https://chromewebstore.google.com/detail/${EXTENSION_ID || 'EXTENSION_ID'}`;

export const REPO_URL = 'https://github.com/antalikra/Convertly';
export const PRIVACY_URL = `${REPO_URL}/blob/main/store/PRIVACY.md`;
export const LICENSES_URL = `${REPO_URL}#dependencies-all-bundled-no-cdn`;
export const KOFI_URL = 'https://ko-fi.com/antalikra';
export const PAYPAL_URL = 'https://www.paypal.com/donate/?hosted_button_id=AXQ9EVTZL6TDA';
