import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import BlogLoading from '../app/blog/loading';
import PostLoading from '../app/blog/[slug]/loading';
import TagLoading from '../app/tags/[tag]/loading';

/**
 * Route-level loading states render no props (Next calls `loading.tsx` bare)
 * and are Server Components, so `renderToStaticMarkup` is enough — no jsdom,
 * matching the `environment: 'node'` every other suite here runs under.
 *
 * Shallow by design, per the issue: appearance is the differ's in Wave 4. This
 * only pins the count of placeholder shapes, which is what would silently drop
 * to zero if a loading module regressed to an empty shell.
 */
const render = (Component: () => ReactElement) =>
  renderToStaticMarkup(createElement(Component));

const skeletonCount = (html: string) =>
  (html.match(/class="[^"]*"/g) ?? []).filter((attr) =>
    attr.slice('class="'.length, -1).split(/\s+/).includes('ds-skeleton'),
  ).length;

const cardCount = (html: string) => (html.match(/class="ds-card[^"]*"/g) ?? []).length;

describe('/blog/[slug]/loading', () => {
  it('renders a title, a meta line, a tag row and several body lines', () => {
    expect(skeletonCount(render(PostLoading))).toBe(11);
  });
});

describe('/blog/loading and /tags/[tag]/loading', () => {
  it('renders the same BlogIndexTemplate-shaped skeleton on both routes', () => {
    expect(skeletonCount(render(BlogLoading))).toBe(skeletonCount(render(TagLoading)));
  });

  it('renders a heading block plus three card-shaped skeletons', () => {
    const html = render(BlogLoading);

    expect(cardCount(html)).toBe(3);
    expect(skeletonCount(html)).toBe(19);
  });
});
