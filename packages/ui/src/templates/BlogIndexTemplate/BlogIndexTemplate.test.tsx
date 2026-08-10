import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { BlogIndexTemplate } from './BlogIndexTemplate';

// `globals` is off in vitest.config.ts, so Testing Library registers no automatic
// cleanup — without this every render stacks in the same document and the queries
// below match the previous test's DOM.
afterEach(cleanup);

const posts = [
  {
    title: 'Visual regression with agents',
    description: 'What breaks when an autonomous pipeline owns your pixels.',
    href: '/blog/visual-regression-with-agents',
    date: '2026-08-01',
    readingMinutes: 7,
    tags: ['testing'],
  },
  {
    title: 'A gate that reads pixels',
    description: 'Two-level thresholds and the baselines behind them.',
    href: '/blog/a-gate-that-reads-pixels',
    date: '2026-07-14',
    readingMinutes: 4,
    tags: ['ci'],
  },
];

describe('BlogIndexTemplate', () => {
  it('renders the title as the page heading', () => {
    render(<BlogIndexTemplate title="Blog" posts={posts} />);

    const heading = screen.getByRole('heading', { level: 1 });

    expect(heading.textContent).toBe('Blog');
  });

  it('renders the intro when one is given', () => {
    render(<BlogIndexTemplate title="Blog" intro="Posts on agents." posts={posts} />);

    const paragraph = screen.getByText('Posts on agents.');

    expect(paragraph.tagName).toBe('P');
  });

  it('renders no intro paragraph when none is given', () => {
    const { container } = render(<BlogIndexTemplate title="Blog" posts={posts} />);

    const intro = container.querySelector('.ds-blog-index__intro');

    expect(intro).toBeNull();
  });

  it('renders one card per post, in the order given', () => {
    render(<BlogIndexTemplate title="Blog" posts={posts} />);

    const titles = screen.getAllByRole('heading', { level: 2 });

    expect(titles.map((title) => title.textContent)).toEqual([
      'Visual regression with agents',
      'A gate that reads pixels',
    ]);
  });

  it('passes each post through to its card', () => {
    render(<BlogIndexTemplate title="Blog" posts={posts} />);

    const link = screen.getByRole('link', { name: 'A gate that reads pixels' });

    expect(link.getAttribute('href')).toBe('/blog/a-gate-that-reads-pixels');
    expect(
      screen.getByText('Two-level thresholds and the baselines behind them.'),
    ).not.toBeNull();
    expect(screen.getByText('4 min')).not.toBeNull();
  });

  it('renders the empty slot instead of the cards when there are no posts', () => {
    render(
      <BlogIndexTemplate title="Tag: ci" posts={[]} empty="No posts for this tag." />,
    );

    const message = screen.getByText('No posts for this tag.');

    expect(message).not.toBeNull();
    expect(screen.queryAllByRole('heading', { level: 2 })).toHaveLength(0);
  });

  it('falls back to its own message when no empty slot is given', () => {
    const { container } = render(<BlogIndexTemplate title="Blog" posts={[]} />);

    const empty = container.querySelector('.ds-empty');

    expect(empty?.textContent).toBe('No posts yet.');
  });

  // The edge case: an empty list wrapper is invisible to a reader and to this
  // suite, but it still contributes its parent's gap — a spacing bug the differ
  // would catch later at pixel cost rather than here for free.
  it('leaves no list wrapper behind when there are no posts', () => {
    const { container } = render(<BlogIndexTemplate title="Blog" posts={[]} />);

    const list = container.querySelector('.ds-blog-index__list');

    expect(list).toBeNull();
  });

  it('carries only the Stack and block classes when no className is supplied', () => {
    const { container } = render(<BlogIndexTemplate title="Blog" posts={posts} />);

    const root = container.firstElementChild;

    // Exact, not `toContain`: an omitted `className` must be filtered out rather
    // than joined in as a trailing empty or `undefined` class.
    expect(root?.className).toBe('ds-stack ds-blog-index');
  });

  it('appends a caller-supplied className to the root', () => {
    const { container } = render(
      <BlogIndexTemplate title="Blog" posts={posts} className="u-mt-2" />,
    );

    const root = container.firstElementChild;

    expect(root?.className).toBe('ds-stack ds-blog-index u-mt-2');
  });
});
