import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Card, CardHeader, CardTitle } from './Card';

// `globals` is off in vitest.config.ts, so Testing Library registers no automatic
// cleanup — without this every render stacks in the same document and the queries
// below match the previous test's DOM.
afterEach(cleanup);

describe('Card', () => {
  it('is padded and non-interactive by default', () => {
    render(<Card>body</Card>);

    const card = screen.getByText('body');

    // Exact, not `toContain`: this pins both halves of the default at once — the
    // padded modifier present and the interactive one absent.
    expect(card.className).toBe('ds-card ds-card--padded');
  });

  it('drops the padded modifier when padding is turned off', () => {
    render(<Card padded={false}>body</Card>);

    const card = screen.getByText('body');

    expect(card.className).toBe('ds-card');
  });

  it('adds the interactive modifier when interactive', () => {
    render(<Card interactive>body</Card>);

    const card = screen.getByText('body');

    expect(card.className).toBe('ds-card ds-card--padded ds-card--interactive');
  });

  it('appends a caller-supplied className after the modifiers', () => {
    render(<Card className="u-mt-2">body</Card>);

    const card = screen.getByText('body');

    expect(card.className).toBe('ds-card ds-card--padded u-mt-2');
  });

  it('forwards the remaining props to the underlying div', () => {
    const onClick = vi.fn();
    render(
      <Card interactive onClick={onClick}>
        body
      </Card>,
    );

    fireEvent.click(screen.getByText('body'));

    // `ds-card--interactive` only styles a hover; the click handler that makes the
    // card actually clickable arrives through the HTMLAttributes spread.
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('CardHeader', () => {
  it('renders its children in the header slot', () => {
    render(<CardHeader>Meta</CardHeader>);

    const header = screen.getByText('Meta');

    expect(header.className).toBe('ds-card__header');
  });

  it('appends a caller-supplied className', () => {
    render(<CardHeader className="u-mt-2">Meta</CardHeader>);

    const header = screen.getByText('Meta');

    expect(header.className).toBe('ds-card__header u-mt-2');
  });
});

describe('CardTitle', () => {
  it('renders a level-3 heading', () => {
    render(<CardTitle>Deploys</CardTitle>);

    const title = screen.getByRole('heading', { level: 3, name: 'Deploys' });

    // The heading level is asserted by the query itself — `getByRole` throws when
    // the tag stops being an `h3`, and the card title has to stay a heading for
    // the document outline. Styling rides on the class, asserted here.
    expect(title.className).toBe('ds-card__title');
  });

  it('appends a caller-supplied className', () => {
    render(<CardTitle className="u-mt-2">Deploys</CardTitle>);

    const title = screen.getByRole('heading', { name: 'Deploys' });

    expect(title.className).toBe('ds-card__title u-mt-2');
  });
});
