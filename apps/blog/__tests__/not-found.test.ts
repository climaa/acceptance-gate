import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import NotFound, { metadata } from '../app/not-found';
import { NOT_FOUND_ACTION, NOT_FOUND_NOTE, NOT_FOUND_TITLE } from '../lib/site';

/**
 * The page every miss renders — an unmatched address and every `notFound()`.
 * The `404` itself is `proxy.ts`'s (see proxy.test.ts); what is pinned here is
 * what someone who lands on it reads and where it sends them on.
 *
 * Read off static markup, like loading.test.ts: a Server Component with no
 * props and no effects needs no document. Copy is compared against the
 * constants in `lib/site.ts` rather than retyped, so wording can change there
 * without a test to chase — what cannot change silently is that the page shows
 * it.
 */
const render = () => renderToStaticMarkup(createElement(NotFound));

const headings = (html: string) =>
  [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)].map(([, text]) => text);

const anchors = (html: string) =>
  [...html.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].map(
    ([, href, text]) => ({ href, text }),
  );

describe('app/not-found', () => {
  it('names the page in the document title', () => {
    expect(metadata.title).toBe(NOT_FOUND_TITLE);
  });

  it('renders exactly one h1, carrying the not-found title', () => {
    const html = render();

    expect(headings(html)).toEqual([NOT_FOUND_TITLE]);
  });

  it('explains the miss instead of listing posts', () => {
    const html = render();

    expect(html).toContain(NOT_FOUND_NOTE);
    // The empty branch, not a short list: the template drew no post list.
    expect(html).not.toContain('ds-blog-index__list');
  });

  it('offers one way on: a link to the blog index', () => {
    const html = render();

    expect(anchors(html)).toEqual([{ href: '/blog', text: NOT_FOUND_ACTION }]);
  });
});
