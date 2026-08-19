import { SKIP_TAG } from '@gate/visual-diff/policy';
import { cleanup, render, screen } from '@testing-library/react';
import type { AnchorHTMLAttributes } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { TagList } from './TagList';
import * as tagListStories from './TagList.stories';
import { Empty } from './TagList.stories';

// `globals` is off in vitest.config.ts, so Testing Library registers no automatic
// cleanup — without this every render stacks in the same document and the queries
// below match the previous test's DOM.
afterEach(cleanup);

// Stands in for `next/link`, which packages/ui may not depend on (see Tag.tsx).
function RouterLink(props: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a data-routed="true" {...props} />;
}

describe('TagList', () => {
  it('renders one link per tag inside a semantic list', () => {
    render(<TagList tags={['testing', 'agents', 'ci']} />);

    const list = screen.getByRole('list');
    const items = screen.getAllByRole('listitem');
    const links = screen.getAllByRole('link');

    expect(list.tagName).toBe('UL');
    expect(items).toHaveLength(3);
    expect(links.map((link) => link.textContent)).toEqual(['testing', 'agents', 'ci']);
  });

  it('builds each href with a caller-supplied hrefFor', () => {
    render(<TagList tags={['react']} hrefFor={(tag) => `/topics/${tag}`} />);

    const link = screen.getByRole('link', { name: 'react' });

    expect(link.getAttribute('href')).toBe('/topics/react');
  });

  it('percent-encodes each tag with the default href builder', () => {
    render(<TagList tags={['next js']} />);

    const link = screen.getByRole('link', { name: 'next js' });

    expect(link.getAttribute('href')).toBe('/tags/next%20js');
  });

  // Edge case: an empty tags array must render nothing at all, not an empty <ul>.
  it('renders nothing at all for an empty tags array', () => {
    const { container } = render(<TagList tags={[]} />);

    expect(container.firstChild).toBeNull();
  });

  it('forwards `as` straight through to each Tag', () => {
    render(<TagList tags={['react']} as={RouterLink} />);

    const link = screen.getByRole('link', { name: 'react' });

    expect(link.dataset.routed).toBe('true');
  });

  it('carries only the Stack and block classes when no className is supplied', () => {
    render(<TagList tags={['react']} />);

    const list = screen.getByRole('list');

    // Exact, not `toContain`: an omitted `className` must be filtered out rather
    // than joined in as a trailing empty or `undefined` class.
    expect(list.className).toBe('ds-stack ds-tag-list');
  });

  it('appends a caller-supplied className', () => {
    render(<TagList tags={['react']} className="u-mt-2" />);

    const list = screen.getByRole('list');

    expect(list.className).toBe('ds-stack ds-tag-list u-mt-2');
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
  it('skips the empty story, with the string policy.mjs declares', () => {
    // Storybook indexes CSF statically and rejects a non-literal tag, so the
    // story file has to write the string out; this is where that literal is
    // checked against the policy that reads it. An empty tag array renders
    // `null`, so there is no `#storybook-root` box to shoot — and unlike
    // SkipLink's unfocused Default, no other state of this story renders either.
    expect(Empty.tags).toEqual([SKIP_TAG]);
  });

  it('skips that story and no other in the file', () => {
    // Exact, over every export rather than a named sibling: the corpus-wide pin
    // in src/__tests__ keys on the file, so it cannot see a *second* skip added
    // here. `ThreeTags` and `OneTag` are what baseline the component at all, and
    // the skip above is only free while they stay captured.
    expect(skippingStories(tagListStories)).toEqual(['Empty']);
  });
});
