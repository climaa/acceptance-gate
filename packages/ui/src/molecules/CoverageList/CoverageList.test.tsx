import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  CoverageList,
  dimensionHue,
  formatCoverage,
  formatPointsDelta,
} from './CoverageList';

afterEach(cleanup);

describe('dimensionHue', () => {
  it.each([
    ['code', 'chart'],
    ['visual', 'chart-2'],
    ['acceptance', 'chart-3'],
    ['health', 'chart-4'],
  ] as const)('draws %s in %s', (dimension, hue) => {
    expect(dimensionHue(dimension)).toBe(hue);
  });
});

describe('formatCoverage', () => {
  it('reads a share as a whole percent', () => {
    expect(formatCoverage(30.6)).toBe('31%');
  });

  it('never reads past the ends of the scale', () => {
    expect(formatCoverage(104)).toBe('100%');
    expect(formatCoverage(-2)).toBe('0%');
  });
});

describe('formatPointsDelta', () => {
  it('writes a rise in points over its window', () => {
    expect(formatPointsDelta(7, '30 d')).toBe('+7 pts · 30 d');
  });

  it('writes a fall with a true minus', () => {
    expect(formatPointsDelta(-4, '30 d')).toBe('−4 pts · 30 d');
  });

  it('writes no change as zero points', () => {
    expect(formatPointsDelta(0, '30 d')).toBe('0 pts · 30 d');
  });

  it('leaves the window out when there is none', () => {
    expect(formatPointsDelta(9)).toBe('+9 pts');
  });
});

const ROWS = [
  { dimension: 'code', name: 'Code', detail: 'lines covered', value: 31, delta: 7 },
  {
    dimension: 'health',
    name: 'Health',
    detail: '10 of 11 scopes',
    value: 91,
    delta: -2,
  },
] as const;

describe('CoverageList', () => {
  it('renders the heading and one row per dimension, in the order given', () => {
    render(
      <CoverageList
        title="Repository coverage"
        description="How much each dimension covers."
        rows={[...ROWS]}
        window="30 d"
      />,
    );

    expect(screen.getByText('Repository coverage')).toBeTruthy();
    expect(screen.getByText('How much each dimension covers.')).toBeTruthy();
    const rows = screen.getAllByRole('listitem');
    expect(
      rows.map((row) => within(row).getByText(/^(Code|Health)$/).textContent),
    ).toEqual(['Code', 'Health']);
  });

  it('gives each row its figure, its Meter in the dimension hue and its toned delta', () => {
    render(<CoverageList title="Coverage" rows={[...ROWS]} window="30 d" />);

    const meter = screen.getByRole('meter', { name: 'Code coverage' });
    expect(meter.getAttribute('aria-valuenow')).toBe('31');
    expect(meter.className).toContain('ds-meter--chart');
    expect(screen.getByText('31%')).toBeTruthy();
    expect(screen.getByText('+7 pts · 30 d').className).toContain('ds-badge--success');
    expect(screen.getByText('−2 pts · 30 d').className).toContain('ds-badge--danger');
  });

  it('draws the key dot in the dimension hue, hidden from assistive tech', () => {
    const { container } = render(<CoverageList title="Coverage" rows={[...ROWS]} />);

    const key = container.querySelector('.ds-coverage-list__key--chart-4');
    expect(key?.getAttribute('aria-hidden')).toBe('true');
  });

  it('draws no delta for a row that has no history yet', () => {
    const { container } = render(
      <CoverageList
        title="Coverage"
        rows={[{ dimension: 'visual', name: 'Visual', value: 76 }]}
      />,
    );

    expect(container.querySelector('.ds-badge')).toBeNull();
    expect(screen.getByText('76%')).toBeTruthy();
  });
});
