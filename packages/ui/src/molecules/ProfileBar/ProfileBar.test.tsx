import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ProfileBar, formatShare, profileSegments } from './ProfileBar';

afterEach(cleanup);

describe('profileSegments', () => {
  it('gives each band its share of the bar, the shares normalised to fill it', () => {
    const segments = profileSegments([50, 25, 15, 10]);

    expect(segments.map(({ band, size }) => [band, size])).toEqual([
      ['low', 0.5],
      ['medium', 0.25],
      ['high', 0.15],
      ['very-high', 0.1],
    ]);
  });

  it('stretches shares that fall short of 100 to the whole bar', () => {
    const segments = profileSegments([83.7, 9, 4.4, 2.8]);

    const total = segments.reduce((sum, { size }) => sum + size, 0);
    expect(total).toBeCloseTo(1, 10);
    expect(segments[0]!.size).toBeCloseTo(83.7 / 99.9, 10);
  });

  it('drops an empty, negative or non-finite band from the bar', () => {
    const segments = profileSegments([90, 0, Number.NaN, -3]);

    expect(segments.map(({ band, size }) => [band, size])).toEqual([['low', 1]]);
  });

  it('draws no bar when every share is empty', () => {
    const segments = profileSegments([0, 0, 0, 0]);

    expect(segments).toEqual([]);
  });
});

describe('formatShare', () => {
  it('keeps at most one decimal and drops a trailing zero', () => {
    const labels = [83.7, 9, 4.44, 0].map(formatShare);

    expect(labels).toEqual(['83.7%', '9%', '4.4%', '0%']);
  });

  it('reads a share that is not a number as none', () => {
    const label = formatShare(Number.NaN);

    expect(label).toBe('0%');
  });
});

describe('ProfileBar', () => {
  it('keys every band with its share, an empty one included', () => {
    render(
      <ProfileBar
        title="Function size"
        unit="lines per function"
        shares={[90, 10, 0, 0]}
      />,
    );

    const key = screen.getByRole('list', { name: 'Function size' });
    expect(key.textContent).toBe('low 90%medium 10%high 0%very high 0%');
  });

  it('draws a segment per band that has a share', () => {
    const { container } = render(
      <ProfileBar
        title="Function size"
        unit="lines per function"
        shares={[90, 10, 0, 0]}
      />,
    );

    const grows = [
      ...container.querySelectorAll<HTMLElement>('.ds-profile-bar__segment'),
    ].map((segment) => segment.style.flexGrow);
    expect(grows).toEqual(['0.9', '0.1']);
  });
});
