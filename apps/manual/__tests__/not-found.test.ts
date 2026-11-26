import { createElement } from 'react';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.ts` include means tsc typechecks this file.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import NotFound, { metadata } from '@/app/not-found';
import { NOT_FOUND_ACTION, NOT_FOUND_NOTE, NOT_FOUND_TITLE } from '@/lib/site';

/**
 * The page every miss renders — an address no route matches, and the
 * `notFound()` an unknown slug reaches. The `404` itself is `proxy.ts`'s (see
 * proxy.test.ts); what is pinned here is what someone who lands on it reads and
 * where it sends them on.
 *
 * Read off static markup: a Server Component with no props and no effects needs
 * no document, so this stays in the suite's `node` environment. Copy is compared
 * against the constants in `lib/site.ts` rather than retyped, so wording can
 * change there without a test to chase — what cannot change silently is that
 * the page shows it.
 */
const render = () => renderToStaticMarkup(createElement(NotFound));

const headings = (html: string) =>
  [...html.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/g)].map(([, level, text]) => ({
    level,
    text,
  }));

const anchors = (html: string) =>
  [...html.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].map(
    ([, href, text]) => ({ href, text }),
  );

describe('app/not-found.tsx', () => {
  it('names the page in the document title', () => {
    expect(metadata.title).toBe(NOT_FOUND_TITLE);
  });

  // The only heading on the page: a miss lists no features, so nothing ranks
  // below it.
  it('renders exactly one heading, an h1 carrying the not-found title', () => {
    const html = render();

    expect(headings(html)).toEqual([{ level: '1', text: NOT_FOUND_TITLE }]);
  });

  it('explains the miss', () => {
    const html = render();

    expect(html).toContain(NOT_FOUND_NOTE);
  });

  // Next's built-in page offers no way onward; this one sends the reader to the
  // index of every published page.
  it('offers one way on: a link to the manual index', () => {
    const html = render();

    expect(anchors(html)).toEqual([{ href: '/', text: NOT_FOUND_ACTION }]);
  });

  it('prints no route detail beyond its own copy', () => {
    const html = render();

    expect(html).not.toContain('404');
    expect(html).not.toContain('This page could not be found');
  });
});
