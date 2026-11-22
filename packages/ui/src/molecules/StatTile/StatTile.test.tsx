import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { StatTile, statTileBadge } from './StatTile';

afterEach(cleanup);

describe('statTileBadge', () => {
  it('marks a measured figure with a success badge', () => {
    const badge = statTileBadge('measured');

    expect(badge).toEqual({ tone: 'success', text: 'measured' });
  });

  it('marks an unmeasured figure with a danger badge', () => {
    const badge = statTileBadge('unmeasured');

    expect(badge).toEqual({ tone: 'danger', text: 'unmeasured' });
  });

  it('marks a figure that does not apply with the dashed badge', () => {
    const badge = statTileBadge('not-applicable');

    expect(badge).toEqual({ tone: 'dashed', text: 'n/a' });
  });

  it('gives a gap count no badge: the count is its own state', () => {
    const badge = statTileBadge('gaps');

    expect(badge).toBeNull();
  });
});

describe('StatTile', () => {
  it('renders the label, the figure, the detail and the state badge', () => {
    render(
      <StatTile label="Unit" value="98.9%" detail="349 of 353 lines" state="measured" />,
    );

    expect(screen.getByText('Unit')).toBeTruthy();
    expect(screen.getByText('98.9%')).toBeTruthy();
    expect(screen.getByText('349 of 353 lines')).toBeTruthy();
    expect(screen.getByText('measured').className).toContain('ds-badge--success');
  });

  it('draws the Meter it is given, with its floor', () => {
    render(
      <StatTile
        label="Unit"
        value="98.9%"
        state="measured"
        meter={{ label: 'Unit coverage', value: 98.9, floor: 70 }}
      />,
    );

    const meter = screen.getByRole('meter', { name: 'Unit coverage' });

    expect(meter.getAttribute('aria-valuetext')).toBe('98.9%, floor 70%');
  });

  it('draws an unmeasured Meter as the dashed image, never as a zero', () => {
    render(
      <StatTile
        label="Unit"
        value="none"
        state="unmeasured"
        meter={{ label: 'Unit coverage', value: null }}
      />,
    );

    expect(screen.queryByRole('meter')).toBeNull();
    expect(screen.getByRole('img', { name: 'Unit coverage: unmeasured' })).toBeTruthy();
  });

  it('renders no badge and no meter for a gap count', () => {
    const { container } = render(<StatTile label="Gaps" value="23" state="gaps" />);

    expect(container.querySelector('.ds-badge')).toBeNull();
    expect(container.querySelector('.ds-meter')).toBeNull();
  });

  it('names its state on the root so the sheet can tone the figure', () => {
    const { container } = render(
      <StatTile label="Acceptance" value="—" state="not-applicable" />,
    );

    expect(container.firstElementChild?.className).toContain(
      'ds-stat-tile--not-applicable',
    );
  });
});
