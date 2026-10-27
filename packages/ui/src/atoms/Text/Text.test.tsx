import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Text, TEXT_VARIANTS, type TextVariant } from './Text';

// `globals` is off in vitest.config.ts, so Testing Library registers no automatic
// cleanup — without this every render stacks in the same document.
afterEach(cleanup);

describe('Text', () => {
  it('renders a body paragraph when no variant is given', () => {
    render(<Text>Copy.</Text>);

    const text = screen.getByText('Copy.');

    expect(text.tagName).toBe('P');
    expect(text.className).toBe('ds-text ds-text--body');
  });

  const defaults: [TextVariant, string][] = [
    ['heading-1', 'H1'],
    ['heading-2', 'H2'],
    ['heading-3', 'H3'],
    ['title', 'H3'],
    ['body', 'P'],
    ['body-sm', 'P'],
    ['caption', 'SPAN'],
    ['label', 'SPAN'],
    ['code', 'CODE'],
  ];

  it('covers every variant in the table below', () => {
    expect(defaults.map(([variant]) => variant)).toEqual([...TEXT_VARIANTS]);
  });

  it.each(defaults)('renders %s as <%s> with its role class', (variant, tagName) => {
    render(<Text variant={variant}>Copy.</Text>);

    const text = screen.getByText('Copy.');

    expect(text.tagName).toBe(tagName);
    expect(text.className).toBe(`ds-text ds-text--${variant}`);
  });

  it('renders the element `as` names, keeping the role', () => {
    render(
      <Text variant="heading-2" as="h1">
        Page
      </Text>,
    );

    const heading = screen.getByRole('heading', { level: 1, name: 'Page' });

    expect(heading.className).toBe('ds-text ds-text--heading-2');
  });

  it('appends a caller-supplied className', () => {
    render(
      <Text variant="label" className="vd-field__label">
        sha
      </Text>,
    );

    expect(screen.getByText('sha').className).toBe(
      'ds-text ds-text--label vd-field__label',
    );
  });

  it('forwards attributes it does not own, the ARIA role among them', () => {
    render(
      <Text variant="caption" role="status" id="note">
        Saved
      </Text>,
    );

    const status = screen.getByRole('status');

    expect(status.id).toBe('note');
    expect(status.className).toBe('ds-text ds-text--caption');
  });
});
