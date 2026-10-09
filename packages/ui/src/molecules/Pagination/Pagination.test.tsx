import { SKIP_TAG } from '@gate/visual-diff/policy';
import { cleanup, render, screen } from '@testing-library/react';
import type { AnchorHTMLAttributes } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { Pagination, paginationWindow } from './Pagination';
import * as paginationStories from './Pagination.stories';
import { SinglePage } from './Pagination.stories';

// `globals` is off in vitest.config.ts, so Testing Library registers no automatic
// cleanup — without this every render stacks in the same document and the queries
// below match the previous test's DOM.
afterEach(cleanup);

// Stands in for `next/link`, which packages/ui may not depend on (see Link.tsx).
function RouterLink(props: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a data-routed="true" {...props} />;
}

describe('paginationWindow', () => {
  it('shows every page when they all fit', () => {
    expect(paginationWindow(2, 3)).toEqual([1, 2, 3]);
  });

  it('keeps the first, the last and one neighbour each side, with one gap per run', () => {
    expect(paginationWindow(7, 12)).toEqual([1, 'gap', 6, 7, 8, 'gap', 12]);
  });

  it('opens no gap for a run of nothing', () => {
    // Page 3 of 12: 1 and 2 are kept outright, so there is nothing to collapse
    // before the window, and only one gap after it.
    expect(paginationWindow(3, 12)).toEqual([1, 2, 3, 4, 'gap', 12]);
  });

  it('handles the ends without a neighbour past them', () => {
    expect(paginationWindow(1, 5)).toEqual([1, 2, 'gap', 5]);
    expect(paginationWindow(5, 5)).toEqual([1, 'gap', 4, 5]);
  });
});

describe('Pagination', () => {
  it('is a navigation landmark named Pagination around a list', () => {
    render(<Pagination page={2} pageCount={3} />);

    const nav = screen.getByRole('navigation', { name: 'Pagination' });
    const list = screen.getByRole('list');

    expect(nav.contains(list)).toBe(true);
    expect(list.tagName).toBe('UL');
  });

  it('links every page but the current one, which is text marked current', () => {
    render(<Pagination page={2} pageCount={3} />);

    const links = screen
      .getAllByRole('link')
      .map((link) => link.getAttribute('aria-label'));
    const current = screen.getByText('2');

    expect(links).toEqual(['Previous page', 'Page 1', 'Page 3', 'Next page']);
    expect(current.tagName).toBe('SPAN');
    expect(current.getAttribute('aria-current')).toBe('page');
  });

  it('addresses page 1 as /blog and the rest as /blog/page/N by default', () => {
    render(<Pagination page={2} pageCount={3} />);

    expect(screen.getByRole('link', { name: 'Page 1' }).getAttribute('href')).toBe(
      '/blog',
    );
    expect(screen.getByRole('link', { name: 'Page 3' }).getAttribute('href')).toBe(
      '/blog/page/3',
    );
    expect(screen.getByRole('link', { name: 'Previous page' }).getAttribute('href')).toBe(
      '/blog',
    );
  });

  it('builds each href with a caller-supplied hrefFor', () => {
    render(
      <Pagination page={1} pageCount={2} hrefFor={(page) => `/posts?page=${page}`} />,
    );

    expect(screen.getByRole('link', { name: 'Page 2' }).getAttribute('href')).toBe(
      '/posts?page=2',
    );
  });

  // The arrows stay rendered so the row keeps its shape, but as disabled buttons:
  // out of the tab order, and never a link to a page that does not exist.
  it('renders previous as a disabled button on the first page', () => {
    render(<Pagination page={1} pageCount={3} />);

    const previous = screen.getByRole('button', { name: 'Previous page' });

    expect((previous as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('link', { name: 'Previous page' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Next page' }).getAttribute('href')).toBe(
      '/blog/page/2',
    );
  });

  it('renders next as a disabled button on the last page', () => {
    render(<Pagination page={3} pageCount={3} />);

    expect(
      (screen.getByRole('button', { name: 'Next page' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getByRole('link', { name: 'Previous page' }).getAttribute('href')).toBe(
      '/blog/page/2',
    );
  });

  it('hides each gap from assistive tech', () => {
    render(<Pagination page={7} pageCount={12} />);

    const gaps = screen.getAllByText('…');

    expect(gaps).toHaveLength(2);
    for (const gap of gaps) {
      expect(gap.getAttribute('aria-hidden')).toBe('true');
    }
  });

  // Edge case: one page must render nothing at all, not an empty landmark.
  it('renders nothing at all for a single page', () => {
    const { container } = render(<Pagination page={1} pageCount={1} />);

    expect(container.firstChild).toBeNull();
  });

  it('forwards `as` to the numbers and to both arrows', () => {
    render(<Pagination page={2} pageCount={3} as={RouterLink} />);

    for (const link of screen.getAllByRole('link')) {
      expect(link.dataset.routed).toBe('true');
    }
  });

  it('carries only its block class when no className is supplied', () => {
    render(<Pagination page={1} pageCount={2} />);

    // Exact, not `toContain`: an omitted `className` must be filtered out rather
    // than joined in as a trailing empty or `undefined` class.
    expect(screen.getByRole('navigation').className).toBe('ds-pagination');
  });

  it('appends a caller-supplied className', () => {
    render(<Pagination page={1} pageCount={2} className="u-mt-2" />);

    expect(screen.getByRole('navigation').className).toBe('ds-pagination u-mt-2');
  });
});

/**
 * Every export in a story module that opts out of capture, by name.
 *
 * `default` is included deliberately: Storybook merges a meta's tags into every
 * story it holds, so a skip written there would take the whole file out of the
 * gate while each named export still reported none of its own.
 */
const skippingStories = (module: Record<string, { tags?: readonly string[] }>) =>
  Object.entries(module)
    .filter(([, story]) => story?.tags?.includes(SKIP_TAG))
    .map(([name]) => name)
    .sort();

describe('the capture contract', () => {
  it('skips the single-page story, with the string policy.mjs declares', () => {
    // Storybook indexes CSF statically and rejects a non-literal tag, so the
    // story file has to write the string out; this is where that literal is
    // checked against the policy that reads it.
    expect(SinglePage.tags).toEqual([SKIP_TAG]);
  });

  it('skips that story and no other in the file', () => {
    // Exact, over every export: the corpus-wide pin in src/__tests__ keys on the
    // file, so it cannot see a *second* skip added here. The four drawn states
    // are what baseline the component at all.
    expect(skippingStories(paginationStories)).toEqual(['SinglePage']);
  });
});
