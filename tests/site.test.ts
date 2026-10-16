import { describe, it, expect } from 'vitest';
import { buildSite } from '../site/render';
import { LOCALES } from '../site/content';
import { SLUGS } from '../site/pages';

// Website text: search-friendly lengths, complete pages, and links that resolve.
const site = buildSite({ base: '/Convertly/', siteUrl: 'https://example.test/Convertly/', csp: true });

describe('website', () => {
  for (const l of LOCALES) {
    it(`${l.lang}: every landing page has a fitting title, description, text and FAQ`, () => {
      const titles = new Set<string>();
      const descriptions = new Set<string>();
      for (const slug of SLUGS) {
        const p = l.pages[slug];
        expect(p.title.length, `${slug} title`).toBeLessThanOrEqual(60);
        expect(p.description.length, `${slug} description`).toBeGreaterThanOrEqual(120);
        expect(p.description.length, `${slug} description`).toBeLessThanOrEqual(160);
        expect(p.sections.length, `${slug} sections`).toBeGreaterThanOrEqual(3);
        expect(p.sections.length, `${slug} sections`).toBeLessThanOrEqual(4);
        expect(p.faq.length, `${slug} faq`).toBeGreaterThanOrEqual(3);
        titles.add(p.title);
        descriptions.add(p.description);
      }
      expect(titles.size).toBe(SLUGS.length);
      expect(descriptions.size).toBe(SLUGS.length);
    });
  }

  it('builds a page per language and task, plus the root, privacy and 404 pages', () => {
    const files = site.map((p) => p.file);
    for (const slug of SLUGS) expect(files).toContain(`${slug}/index.html`);
    expect(files).toEqual(expect.arrayContaining(['index.html', 'privacy/index.html', '404.html']));
    expect(files.length).toBe(LOCALES.length * (SLUGS.length + 2) + 1);
  });

  it('resolves every {link} placeholder and loads nothing from other sites', () => {
    for (const p of site) {
      expect(p.html, p.file).not.toMatch(/href="\{/);
      expect(p.html, p.file).not.toMatch(/<(script|link|img)[^>]+(src|href)="https?:\/\/(?!example\.test)/);
    }
  });
});
