import { cleanup, render, screen } from '@testing-library/react';
import type { AnchorHTMLAttributes } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { PostCard } from './PostCard';

// `globals` is off in vitest.config.ts, so Testing Library registers no automatic
// cleanup — without this every render stacks in the same document and the queries
// below match the previous test's DOM.
afterEach(cleanup);

// Stands in for `next/link`, which packages/ui may not depend on (see Link.tsx).
function RouterLink(props: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a data-routed="true" {...props} />;
}

const post = {
  title: 'Visual regression with agents',
  description: 'What breaks when an autonomous pipeline owns your pixels.',
  href: '/blog/visual-regression-with-agents',
  date: '2026-08-01',
  readingMinutes: 7,
  tags: ['testing', 'agents'],
};

describe('PostCard', () => {
  it('renders the title, the description, the meta and the tags', () => {
    render(<PostCard {...post} />);

    const title = screen.getByRole('link', { name: post.title });
    const tags = screen.getAllByRole('listitem');

    expect(title.textContent).toBe(post.title);
    expect(screen.getByText(post.description)).not.toBeNull();
    expect(screen.getByText('Aug 2026')).not.toBeNull();
    expect(screen.getByText('7 min')).not.toBeNull();
    expect(tags.map((tag) => tag.textContent)).toEqual(['testing', 'agents']);
  });

  it('renders the title as an h2 by default', () => {
    render(<PostCard {...post} />);

    const heading = screen.getByRole('heading', { name: post.title });

    expect(heading.tagName).toBe('H2');
  });

  // The home page renders these under an existing <h2>, so it needs <h3>;
  // hardcoding either level is a heading-order violation on one of the two pages.
  it('renders the title as an h3 when headingLevel asks for one', () => {
    render(<PostCard {...post} headingLevel="h3" />);

    const heading = screen.getByRole('heading', { name: post.title });

    expect(heading.tagName).toBe('H3');
  });

  it('points the title link at href', () => {
    render(<PostCard {...post} />);

    const title = screen.getByRole('link', { name: post.title });

    expect(title.getAttribute('href')).toBe(post.href);
  });

  // The edge case this component exists to remove: the blog wraps the whole card
  // body in one <a>, which puts the tag links inside it. Nested anchors are
  // invalid HTML and the inner one is unreachable — the card must stretch its
  // title link over itself instead.
  it('keeps the tag links outside the title anchor', () => {
    const { container } = render(<PostCard {...post} />);

    const title = screen.getByRole('link', { name: post.title });
    const tag = screen.getByRole('link', { name: 'testing' });

    expect(title.contains(tag)).toBe(false);
    expect(container.querySelectorAll('a a')).toHaveLength(0);
  });

  it('forwards `as` to the title link and to every tag link', () => {
    render(<PostCard {...post} as={RouterLink} />);

    const links = screen.getAllByRole('link');

    expect(links.map((link) => link.dataset.routed)).toEqual(['true', 'true', 'true']);
  });

  // A post with no tags renders no list at all, not an empty one: TagList's own
  // contract, reached through this card.
  it('renders no tag list for a post with no tags', () => {
    render(<PostCard {...post} tags={[]} />);

    expect(screen.queryByRole('list')).toBeNull();
  });

  it('carries only the Card and block classes when no className is supplied', () => {
    const { container } = render(<PostCard {...post} />);

    const card = container.firstElementChild;

    // Exact, not `toContain`: an omitted `className` must be filtered out rather
    // than joined in as a trailing empty or `undefined` class.
    expect(card?.className).toBe(
      'ds-card ds-card--padded ds-card--interactive ds-post-card',
    );
  });

  it('appends a caller-supplied className to the card', () => {
    const { container } = render(<PostCard {...post} className="u-mt-2" />);

    const card = container.firstElementChild;

    expect(card?.className).toBe(
      'ds-card ds-card--padded ds-card--interactive ds-post-card u-mt-2',
    );
  });
});
