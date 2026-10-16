import type { Slug } from '../pages';

// Text of the site in one language. Body strings are trusted HTML fragments;
// `{<slug>}` becomes the link to that page in the same language, `{store}` the
// Chrome Web Store listing, `{ext-privacy}` the extension's privacy policy and
// `{issues}` the issue tracker.

export interface PageCopy {
  /** <title>, up to 60 characters. */
  title: string;
  /** Meta description, 120–160 characters. */
  description: string;
  h1: string;
  lead: string;
  sections: Array<{ h2: string; body: string }>;
  faq: Array<{ q: string; a: string }>;
}

export interface SiteCopy {
  /** BCP 47 tag; the converter UI uses the same language. */
  lang: string;
  /** Name in the language switcher. */
  name: string;
  /** Short tool names for the navigation. */
  nav: Record<Slug, string>;
  pages: Record<Slug, PageCopy>;
  /** The website's own privacy page (the extension's policy is store/PRIVACY.md). */
  privacy: { title: string; description: string; h1: string; body: string[] };
  ui: {
    skip: string;
    tools: string;
    headerCta: string;
    facts: string[];
    converter: string;
    noscript: string;
    offerText: string;
    offerButton: string;
    ctaTitle: string;
    ctaText: string;
    ctaPoints: string[];
    ctaButton: string;
    ctaNote: string;
    faqTitle: string;
    privacy: string;
    source: string;
    licenses: string;
    support: string;
    footerNote: string;
    language: string;
    notFoundTitle: string;
    notFoundText: string;
  };
}
