import { cleanup, render, screen, within } from '@testing-library/react';
import type { AnchorHTMLAttributes } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { PostTemplate } from './PostTemplate';

// `globals` is off in vitest.config.ts, so Testing Library registers no automatic
// cleanup — without this every render stacks in the same document and the queries
// below match the previous test's DOM.
afterEach(cleanup);

// Stands in for `next/link`, which packages/ui may not depend on (see Tag.tsx).
function RouterLink(props: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a data-routed="true" {...props} />;
}

const POST = {
  title: 'Visual regression with agents',
  date: '2026-08-01',
  readingMinutes: 7,
  tags: ['testing', 'agents'],
};

// The body a real post hands in: already-rendered MDX, starting at h2.
const BODY = (
  <>
    <h2>What breaks</h2>
    <p>An autonomous pipeline owns your pixels.</p>
  </>
);

describe('PostTemplate', () => {
  it('renders the title as the article’s only h1', () => {
    render(<PostTemplate {...POST}>{BODY}</PostTemplate>);

    const headings = screen.getAllByRole('heading', { level: 1 });

    // The body brings its own h2; a second h1 here would leave the document
    // with two top-level headings, which `.ds-prose` is written against.
    expect(headings.map((heading) => heading.textContent)).toEqual([POST.title]);
  });

  it('renders the post’s date and reading time', () => {
    render(<PostTemplate {...POST}>{BODY}</PostTemplate>);

    const time = screen.getByText('Aug 2026');

    expect(time.getAttribute('datetime')).toBe('2026-08-01');
    expect(screen.getByText('7 min')).toBeDefined();
  });

  it('renders one tag link per tag', () => {
    render(<PostTemplate {...POST}>{BODY}</PostTemplate>);

    const links = screen.getAllByRole('link');

    expect(links.map((link) => link.textContent)).toEqual(['testing', 'agents']);
  });

  it('renders the children inside the prose wrapper', () => {
    const { container } = render(<PostTemplate {...POST}>{BODY}</PostTemplate>);

    const prose = container.querySelector('.ds-prose') as HTMLElement;

    expect(prose).not.toBeNull();
    expect(within(prose).getByRole('heading', { level: 2 })).toBeDefined();
    expect(prose.textContent).toContain('An autonomous pipeline owns your pixels.');
  });

  it('keeps the title, meta and tags together in the article header', () => {
    const { container } = render(<PostTemplate {...POST}>{BODY}</PostTemplate>);

    const header = container.querySelector('article > header') as HTMLElement;

    expect(within(header).getByRole('heading', { level: 1 })).toBeDefined();
    expect(within(header).getByText('7 min')).toBeDefined();
    expect(within(header).getAllByRole('listitem')).toHaveLength(2);
    expect(header.querySelector('.ds-prose')).toBeNull();
  });

  // Edge case: no tags must render no list region at all, not an empty one —
  // TagList's own rule, asserted here at the composition level.
  it('renders no tag list region for an empty tags array', () => {
    render(
      <PostTemplate {...POST} tags={[]}>
        {BODY}
      </PostTemplate>,
    );

    expect(screen.queryByRole('list')).toBeNull();
  });

  // Threaded through to TagList so an app's own route shape reaches every chip:
  // the default builder percent-encodes the display text, which for a multi-word
  // tag is a different URL from the one a slug-based route prerenders.
  it('builds every tag href with the builder it is given', () => {
    render(
      <PostTemplate
        {...POST}
        tags={['visual regression']}
        tagHref={(tag) => `/tags/${tag.replace(/\s+/g, '-')}`}
      >
        {BODY}
      </PostTemplate>,
    );

    const tag = screen.getByRole('link', { name: 'visual regression' });

    expect(tag.getAttribute('href')).toBe('/tags/visual-regression');
  });

  it('forwards `as` to every tag link', () => {
    render(
      <PostTemplate {...POST} as={RouterLink}>
        {BODY}
      </PostTemplate>,
    );

    const links = screen.getAllByRole('link');

    expect(links.every((link) => link.dataset.routed === 'true')).toBe(true);
  });

  it('carries only the Stack and block classes when no className is supplied', () => {
    const { container } = render(<PostTemplate {...POST}>{BODY}</PostTemplate>);

    // Exact, not `toContain`: an omitted `className` must be filtered out rather
    // than joined in as a trailing empty or `undefined` class.
    expect(container.firstElementChild?.className).toBe('ds-stack ds-post-template');
  });

  it('appends a caller-supplied className', () => {
    const { container } = render(
      <PostTemplate {...POST} className="u-mt-2">
        {BODY}
      </PostTemplate>,
    );

    expect(container.firstElementChild?.className).toBe(
      'ds-stack ds-post-template u-mt-2',
    );
  });
});
