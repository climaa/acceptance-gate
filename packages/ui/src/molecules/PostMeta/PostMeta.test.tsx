import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PostMeta } from './PostMeta';

// `globals` is off in vitest.config.ts, so Testing Library registers no automatic
// cleanup — without this every render stacks in the same document and the queries
// below match the previous test's DOM.
afterEach(cleanup);
afterEach(() => vi.unstubAllEnvs());

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

  it('formats the date in UTC rather than in the runtime timezone', () => {
    // Node re-reads `TZ` on assignment, so this really does move the process
    // west of Greenwich: unpinned, midnight UTC on the 1st falls back into the
    // previous month and this renders 'Dec 2025'.
    vi.stubEnv('TZ', 'America/Los_Angeles');

    render(<PostMeta date="2026-01-01" readingMinutes={7} />);

    screen.getByText('Jan 2026');
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

  it('carries only the block class when no className is supplied', () => {
    const { container } = render(<PostMeta date="2026-08-09" readingMinutes={7} />);

    // Exact, not `toContain`: an omitted `className` must be filtered out rather
    // than joined in as a trailing empty or `undefined` class.
    expect(container.firstElementChild?.className).toBe('ds-post-meta');
  });

  it('appends a caller-supplied className', () => {
    const { container } = render(
      <PostMeta date="2026-08-09" readingMinutes={7} className="u-mt-2" />,
    );

    expect(container.firstElementChild?.className).toBe('ds-post-meta u-mt-2');
  });
});
