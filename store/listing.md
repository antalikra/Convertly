# Chrome Web Store listing

**Package:** `release/convertly-<version>.zip` (`npm run check` builds it).

## Store listing tab

- **Name and summary** come from the package (`src/i18n/<locale>.json` → `public/_locales`), in 14 languages.
- **Description:** `store/descriptions/<locale>.txt`. English is the default language; add the others with the language selector at the top of the tab (de, es, fr, it, nl, pl, pt_BR, tr, uk, ru, ja, ko, zh_CN).
- **Category:** Tools.
- **Store icon:** `store/icon-128.png`.
- **Screenshots (1280×800):** `store/screenshot-1.png` … `screenshot-5.png`, in this order.
- **Small promo tile (440×280):** `store/tile-440x280.png`.
- **Marquee promo tile (1400×560):** `store/marquee-1400x560.png`.
- **Promo video:** the store takes a YouTube link; `store/demo.mp4` (30 s, 1280×720, no sound) is the file to upload there.
- **Official URL:** none. **Homepage URL:** https://github.com/antalikra/Convertly. **Support URL:** https://github.com/antalikra/Convertly/issues.

## Privacy practices tab

See `store/permissions.md`.
