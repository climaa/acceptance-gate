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
 * Shallow on purpose: what a placeholder LOOKS like is the differ's
 * (CODING_STANDARDS: appearance never gets a unit test). This pins the count of
 * placeholder shapes, which is what would silently drop to zero if a loading
 * module regressed to an empty shell.
 */
const render = (Component: () => ReactElement) =>
  renderToStaticMarkup(createElement(Component));

/**
 * Elements carrying `className` among their classes. Whole classes, not a
 * substring: `ds-skeleton-group` wraps the stacked lines and would otherwise
 * count as a shape of its own.
 */
const countByClass = (html: string, className: string) =>
  (html.match(/class="[^"]*"/g) ?? []).filter((attribute) =>
    attribute.split(/["\s]+/).includes(className),
  ).length;

const skeletonCount = (html: string) => countByClass(html, 'ds-skeleton');

const cardCount = (html: string) => countByClass(html, 'ds-card');

describe('/blog/[slug]/loading', () => {
  it('renders a title, a meta line, a tag row and several body lines', () => {
    const html = render(PostLoading);

    // Title, meta line, three tags, six body lines.
    expect(skeletonCount(html)).toBe(11);
  });
});

describe('/blog/loading and /tags/[tag]/loading', () => {
  it('renders the same BlogIndexTemplate-shaped skeleton on both routes', () => {
    const blogHtml = render(BlogLoading);
    const tagHtml = render(TagLoading);

    expect(blogHtml).toBe(tagHtml);
  });

  it('renders a heading block plus three card-shaped skeletons', () => {
    const html = render(BlogLoading);

    expect(cardCount(html)).toBe(3);
    // The heading, plus six shapes per card: title, two description lines,
    // meta line and two tags.
    expect(skeletonCount(html)).toBe(19);
  });
});
