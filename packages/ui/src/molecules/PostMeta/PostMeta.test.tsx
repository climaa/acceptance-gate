import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { PostMeta } from './PostMeta';

// `globals` is off in vitest.config.ts, so Testing Library registers no automatic
// cleanup — without this every render stacks in the same document and the queries
// below match the previous test's DOM.
afterEach(cleanup);

describe('PostMeta', () => {
  it('renders the formatted date and reading time', () => {
    render(<PostMeta date="2026-08-09" readingMinutes={7} />);

    // `getByText` throws when no match exists, which is the assertion itself.
    screen.getByText('Aug 2026');
    screen.getByText('7 min');
  });

  it('carries the raw ISO date on the <time> element as dateTime', () => {
    render(<PostMeta date="2026-08-09" readingMinutes={7} />);

    const time = screen.getByText('Aug 2026');

    expect(time.tagName).toBe('TIME');
    expect(time.getAttribute('dateTime')).toBe('2026-08-09');
  });

  it('hides the decorative separator from the accessibility tree', () => {
    render(<PostMeta date="2026-08-09" readingMinutes={7} />);

    const separator = screen.getByText('·');

    expect(separator.getAttribute('aria-hidden')).toBe('true');
  });

  it('renders "1 min" rather than "1 mins" for a single-minute read', () => {
    render(<PostMeta date="2026-08-09" readingMinutes={1} />);

    screen.getByText('1 min');
  });

  it('appends a caller-supplied className', () => {
    render(<PostMeta date="2026-08-09" readingMinutes={7} className="u-mt-2" />);

    const time = screen.getByText('Aug 2026');

    expect(time.closest('.ds-post-meta')?.className).toBe('ds-post-meta u-mt-2');
  });
});
