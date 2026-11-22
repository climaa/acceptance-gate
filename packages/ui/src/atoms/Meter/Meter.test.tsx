import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Meter, type MeterHue } from './Meter';

// `globals` is off in vitest.config.ts, so Testing Library registers no automatic
// cleanup — without this every render stacks in the same document and the queries
// below match the previous test's DOM.
afterEach(cleanup);

// Typed as the union rather than inferred, so removing a hue from MeterHue fails
// the typecheck here.
const HUES: MeterHue[] = ['chart', 'chart-2', 'chart-3', 'chart-4'];

const fillOf = (meter: HTMLElement) =>
  meter.querySelector<HTMLElement>('.ds-meter__fill');

const floorOf = (meter: HTMLElement) =>
  meter.querySelector<HTMLElement>('.ds-meter__floor');

describe('Meter', () => {
  describe('a measured value', () => {
    it('exposes role="meter" under the given accessible name', () => {
      render(<Meter label="Code coverage" value={42} />);

      const meter = screen.getByRole('meter', { name: 'Code coverage' });

      expect(meter).toBeTruthy();
    });

    it('reports its value on a 0–100 range', () => {
      render(<Meter label="Code coverage" value={42} />);

      const meter = screen.getByRole('meter');

      expect(meter.getAttribute('aria-valuenow')).toBe('42');
      expect(meter.getAttribute('aria-valuemin')).toBe('0');
      expect(meter.getAttribute('aria-valuemax')).toBe('100');
    });

    it('fills the track to the value as a percentage of its width', () => {
      render(<Meter label="Code coverage" value={18} />);

      const fill = fillOf(screen.getByRole('meter'));

      expect(fill?.style.width).toBe('18%');
    });

    it.each([
      [-5, '0'],
      [140, '100'],
      [Number.NaN, '0'],
    ])('clamps an out-of-range value of %s to %s', (value, expected) => {
      render(<Meter label="Code coverage" value={value} />);

      const meter = screen.getByRole('meter');

      expect(meter.getAttribute('aria-valuenow')).toBe(expected);
    });

    it('draws no fill at zero, and marks the track empty', () => {
      render(<Meter label="Code coverage" value={0} />);

      const meter = screen.getByRole('meter');

      expect(fillOf(meter)).toBeNull();
      expect(meter.className).toBe('ds-meter ds-meter--chart ds-meter--empty');
    });

    it('treats a negative value as empty once clamped', () => {
      render(<Meter label="Code coverage" value={-3} />);

      const meter = screen.getByRole('meter');

      expect(meter.className).toContain('ds-meter--empty');
    });
  });

  describe('hue', () => {
    it('uses the first chart hue by default', () => {
      render(<Meter label="Code coverage" value={42} />);

      const meter = screen.getByRole('meter');

      // Exact, not `toContain`: an omitted `className` must be filtered out rather
      // than joined in as a trailing empty or `undefined` class.
      expect(meter.className).toBe('ds-meter ds-meter--chart');
    });

    it.each(HUES)('maps the %s hue to its modifier class', (hue) => {
      render(<Meter label="Code coverage" value={42} hue={hue} />);

      const meter = screen.getByRole('meter');

      expect(meter.className).toBe(`ds-meter ds-meter--${hue}`);
    });

    it('appends a caller-supplied className last', () => {
      render(<Meter label="Code coverage" value={42} className="u-mt-2" />);

      const meter = screen.getByRole('meter');

      expect(meter.className).toBe('ds-meter ds-meter--chart u-mt-2');
    });
  });

  describe('floor', () => {
    it('draws no tick when no floor is given', () => {
      render(<Meter label="Code coverage" value={42} />);

      const meter = screen.getByRole('meter');

      expect(floorOf(meter)).toBeNull();
      expect(meter.getAttribute('aria-valuetext')).toBeNull();
    });

    it('places the tick at the floor as a percentage of the track', () => {
      render(<Meter label="Code coverage" value={42} floor={60} />);

      const floor = floorOf(screen.getByRole('meter'));

      expect(floor?.style.left).toBe('60%');
    });

    it('clamps a floor outside 0–100 onto the track', () => {
      render(<Meter label="Code coverage" value={42} floor={120} />);

      const floor = floorOf(screen.getByRole('meter'));

      expect(floor?.style.left).toBe('100%');
    });

    it('speaks the floor beside the value, since the tick alone is only seen', () => {
      render(<Meter label="Code coverage" value={42} floor={60} />);

      const meter = screen.getByRole('meter');

      expect(meter.getAttribute('aria-valuetext')).toBe('42%, floor 60%');
    });

    it('keeps the tick on an empty track', () => {
      render(<Meter label="Code coverage" value={0} floor={60} />);

      const meter = screen.getByRole('meter');

      expect(floorOf(meter)).not.toBeNull();
    });
  });

  describe('an unmeasured value', () => {
    it('is not a meter: there is no value for aria-valuenow to report', () => {
      render(<Meter label="Code coverage" value={null} />);

      // A meter with no aria-valuenow fails axe's required-attribute rule, and a
      // made-up 0 would announce "0" for something that was never measured.
      expect(screen.queryByRole('meter')).toBeNull();
    });

    it('announces itself as unmeasured under its name', () => {
      render(<Meter label="Code coverage" value={null} />);

      const meter = screen.getByRole('img', { name: 'Code coverage: unmeasured' });

      expect(meter.className).toBe('ds-meter ds-meter--chart ds-meter--unmeasured');
    });

    it('draws neither a fill nor a floor tick', () => {
      render(<Meter label="Code coverage" value={null} floor={60} />);

      const meter = screen.getByRole('img');

      expect(fillOf(meter)).toBeNull();
      expect(floorOf(meter)).toBeNull();
    });
  });
});
