import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Badge, type BadgeTone } from './Badge';

// `globals` is off in vitest.config.ts, so Testing Library registers no automatic
// cleanup — without this every render stacks in the same document and the queries
// below match the previous test's DOM.
afterEach(cleanup);

// Typed as the union rather than inferred: dropping a tone from BadgeTone without
// dropping it here is a typecheck error, and adding one leaves this row missing.
const TONES: BadgeTone[] = ['neutral', 'accent', 'success', 'warning', 'danger'];

describe('Badge', () => {
  it('renders its children inside a span', () => {
    render(<Badge>Draft</Badge>);

    const badge = screen.getByText('Draft');

    expect(badge.tagName).toBe('SPAN');
  });

  it('renders the neutral tone by default', () => {
    render(<Badge>Draft</Badge>);

    const badge = screen.getByText('Draft');

    // Exact, not `toContain`: an omitted `className` must be filtered out
    // rather than joined in as a trailing empty or `undefined` class.
    expect(badge.className).toBe('ds-badge ds-badge--neutral');
  });

  it.each(TONES)('maps the %s tone to its modifier class', (tone) => {
    render(<Badge tone={tone}>Draft</Badge>);

    const badge = screen.getByText('Draft');

    expect(badge.className).toBe(`ds-badge ds-badge--${tone}`);
  });

  it('appends a caller-supplied className after the tone class', () => {
    render(<Badge className="u-mt-2">Draft</Badge>);

    const badge = screen.getByText('Draft');

    expect(badge.className).toBe('ds-badge ds-badge--neutral u-mt-2');
  });
});
