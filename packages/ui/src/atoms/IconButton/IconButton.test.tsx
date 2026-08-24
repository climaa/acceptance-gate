import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { IconButton } from './IconButton';

// `globals` is off in vitest.config.ts, so Testing Library registers no automatic
// cleanup — without this every render stacks in the same document.
afterEach(cleanup);

const Wand = () => (
  <svg viewBox="0 0 24 24" data-testid="glyph">
    <path d="M4 20 20 4" />
  </svg>
);

describe('IconButton', () => {
  it('is named by its label, because a glyph is not a name', () => {
    render(
      <IconButton label="suggest a label">
        <Wand />
      </IconButton>,
    );

    expect(screen.getByRole('button', { name: 'suggest a label' })).toBeDefined();
  });

  // The assertion above cannot do this one's job. `title` is a last-resort name
  // in the accname algorithm, so with `aria-label` deleted the button is STILL
  // called "suggest a label" and `getByRole(..., {name})` still finds it — the
  // outcome survives while the mechanism quietly degrades to the weakest naming
  // there is. This pins the attribute itself.
  it('names itself with aria-label, not by falling back to the tooltip', () => {
    render(
      <IconButton label="suggest a label">
        <Wand />
      </IconButton>,
    );

    expect(screen.getByRole('button').getAttribute('aria-label')).toBe('suggest a label');
  });

  // The whole reason the wrapper span exists: a caller cannot forget it, so a
  // glyph carrying stray text can never reach the accessible name.
  it('keeps the glyph out of the accessible name', () => {
    render(
      <IconButton label="suggest a label">
        <Wand />
      </IconButton>,
    );

    expect(screen.getByTestId('glyph').closest('[aria-hidden="true"]')).not.toBeNull();
  });

  // Unlike Button, which leaves `type` to the DOM. This one is built to stand
  // among fields, where a submit default would post the form it sits in.
  it('is a button and not a submit, because it stands among fields', () => {
    render(
      <IconButton label="suggest a label">
        <Wand />
      </IconButton>,
    );

    expect(screen.getByRole('button').getAttribute('type')).toBe('button');
  });

  it('lets a caller who means submit say so', () => {
    render(
      <IconButton label="save" type="submit">
        <Wand />
      </IconButton>,
    );

    expect(screen.getByRole('button').getAttribute('type')).toBe('submit');
  });

  it('carries its variant and size as classes', () => {
    render(
      <IconButton label="suggest a label">
        <Wand />
      </IconButton>,
    );

    // Exact, not `toContain`: an omitted `className` must be filtered out rather
    // than joined in as a trailing empty or `undefined` class.
    expect(screen.getByRole('button').className).toBe(
      'ds-icon-btn ds-icon-btn--secondary ds-icon-btn--md',
    );
  });

  it('appends a caller-supplied className after its own', () => {
    render(
      <IconButton label="suggest a label" variant="ghost" size="sm" className="u-mt-2">
        <Wand />
      </IconButton>,
    );

    expect(screen.getByRole('button').className).toBe(
      'ds-icon-btn ds-icon-btn--ghost ds-icon-btn--sm u-mt-2',
    );
  });

  it('names the button with a title too, so a mouse gets the tooltip', () => {
    render(
      <IconButton label="suggest a label">
        <Wand />
      </IconButton>,
    );

    expect(screen.getByRole('button').getAttribute('title')).toBe('suggest a label');
  });

  it('does not fire while disabled', () => {
    const onClick = vi.fn();
    render(
      <IconButton label="suggest a label" disabled onClick={onClick}>
        <Wand />
      </IconButton>,
    );

    fireEvent.click(screen.getByRole('button'));

    expect(onClick).not.toHaveBeenCalled();
  });

  it('forwards the button attributes it does not own', () => {
    const onClick = vi.fn();
    render(
      <IconButton label="suggest a label" onClick={onClick} data-testid="wand">
        <Wand />
      </IconButton>,
    );

    fireEvent.click(screen.getByTestId('wand'));

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
