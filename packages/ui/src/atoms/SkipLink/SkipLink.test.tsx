import { SKIP_TAG } from '@gate/visual-diff/policy';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { SkipLink } from './SkipLink';
import * as skipLinkStories from './SkipLink.stories';
import { Default } from './SkipLink.stories';

// `globals` is off in vitest.config.ts, so Testing Library registers no automatic
// cleanup — without this every render stacks in the same document and the queries
// below match the previous test's DOM.
afterEach(cleanup);

describe('SkipLink', () => {
  it('renders an anchor to #main by default, labelled "Skip to content"', () => {
    render(<SkipLink />);

    const link = screen.getByRole('link', { name: 'Skip to content' });

    expect(link.getAttribute('href')).toBe('#main');
  });

  it('points at the id given via targetId', () => {
    render(<SkipLink targetId="content" />);

    const link = screen.getByRole('link', { name: 'Skip to content' });

    expect(link.getAttribute('href')).toBe('#content');
  });

  it('renders caller-supplied children in place of the default label', () => {
    render(<SkipLink>Skip navigation</SkipLink>);

    const link = screen.getByRole('link', { name: 'Skip navigation' });

    expect(link.textContent).toBe('Skip navigation');
  });

  // Edge case: hidden-until-focused is a styling concern, not a DOM one — the
  // link must stay queryable (and thus reachable by assistive tech and the
  // keyboard) whether or not it currently has focus.
  it('is queryable in the DOM without being focused', () => {
    render(<SkipLink />);

    const link = screen.getByRole('link', { name: 'Skip to content' });

    expect(document.activeElement).not.toBe(link);
    expect(document.body.contains(link)).toBe(true);
  });

  it('carries the visually-hidden utility and its own class', () => {
    render(<SkipLink />);

    const link = screen.getByRole('link', { name: 'Skip to content' });

    // Exact, not `toContain`: an omitted `className` must be filtered out
    // rather than joined in as a trailing empty or `undefined` class.
    expect(link.className).toBe('ds-visually-hidden ds-skip-link');
  });

  it('appends a caller-supplied className to the base classes', () => {
    render(<SkipLink className="u-mt-2" />);

    const link = screen.getByRole('link', { name: 'Skip to content' });

    expect(link.className).toBe('ds-visually-hidden ds-skip-link u-mt-2');
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
  it('skips the unfocused story, with the string policy.mjs declares', () => {
    // Storybook indexes CSF statically and rejects a non-literal tag, so the
    // story file has to write the string out; this is where that literal is
    // checked against the policy that reads it. Unfocused, the link is clipped
    // to nothing by `.ds-visually-hidden` — a targeted shot would frame an empty
    // root box, and nothing else in the pipeline would say so.
    expect(Default.tags).toEqual([SKIP_TAG]);
  });

  it('skips that story and no other in the file', () => {
    // Exact, over every export rather than a named sibling: the corpus-wide pin
    // in src/__tests__ keys on the file, so it cannot see a *second* skip added
    // here — and this is the file where a reader has already been shown that
    // skipping is normal. `Revealed` is what makes the skip above free, being the
    // story that baselines this link on screen; skipping it too would leave the
    // component with no shot at all.
    expect(skippingStories(skipLinkStories)).toEqual(['Default']);
  });
});
