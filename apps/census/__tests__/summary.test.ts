import { describe, expect, it } from 'vitest';

import type { History, Measurement } from '@/lib/measurement.ts';
import { summaryOf } from '@/lib/summary.ts';
import { sample } from './sample';

describe('summaryOf the sample', () => {
  const { measurement, history } = sample();
  const summary = summaryOf(measurement, history);

  it('dates the measurement and names its commit', () => {
    expect(summary.caption).toBe(
      'What changed and what to file first · measured 20 Nov 2026 at 0514dc9.',
    );
  });

  it('says what to file first, what moved and what health costs', () => {
    expect(summary.highlights).toEqual([
      {
        tone: 'alert',
        text: 'Visual is the widest gap: 14 of 19 console components have no story.',
      },
      {
        tone: 'code',
        text: 'Most red coverage is unmeasured, not untested: 93.7% of files are reached by a test.',
      },
      {
        tone: 'acceptance',
        text: 'Acceptance rose 25 points in 30 days: 2 of 4 apps now have a scenario.',
      },
      {
        tone: 'health',
        text: 'Health 84.7 B. Function size costs 10 of the 15.3 points it loses.',
      },
    ]);
  });
});

describe('summaryOf, each highlight on its own condition', () => {
  const base = sample();
  const withGaps = (gaps: Measurement['gaps']): Measurement => ({
    ...base.measurement,
    gaps,
  });
  const flat: History = {
    schema: 1,
    points: base.history.points.map((p) => ({
      ...p,
      dimensions: base.history.points.at(-1)!.dimensions,
    })),
  };

  it('has no alert when nothing is a gap', () => {
    const { highlights } = summaryOf(withGaps([]), base.history);

    expect(highlights.map((h) => h.tone)).not.toContain('alert');
  });

  it('names a widest gap by its count when it is not missing stories', () => {
    // Arrange
    const codeOnly = base.measurement.gaps.filter((g) => g.dimension === 'code');

    // Act
    const { highlights } = summaryOf(withGaps(codeOnly), base.history);

    // Assert
    expect(highlights[0]?.text).toBe('Code is the widest gap: 9 of the 9 gaps.');
  });

  it('says no dimension rose when every line is flat', () => {
    const { highlights } = summaryOf(base.measurement, flat);

    expect(highlights.map((h) => h.tone)).toEqual(['alert', 'code', 'health']);
  });

  it('gives a rise in another dimension its value', () => {
    // Arrange
    const points = flat.points.map((p, i, all) =>
      i === all.length - 1 ? { ...p, dimensions: { ...p.dimensions, code: 40 } } : p,
    );

    // Act
    const { highlights } = summaryOf(base.measurement, { schema: 1, points });

    // Assert
    expect(highlights[2]).toEqual({
      tone: 'code',
      text: 'Code rose 9 points in 30 days, to 40%.',
    });
  });

  it('leaves the reach out when every workspace measures its code', () => {
    // Arrange
    const measured: Measurement = {
      ...base.measurement,
      workspaces: base.measurement.workspaces.filter(
        (ws) => ws.dimensions.code.state !== 'unmeasured',
      ),
    };

    // Act
    const tones = summaryOf(measured, base.history).highlights.map((h) => h.tone);

    // Assert
    expect(tones).not.toContain('code');
  });

  it('states the score alone when nothing costs points', () => {
    // Arrange
    const free: Measurement = {
      ...base.measurement,
      health: { ...base.measurement.health, penalties: [] },
    };

    // Act
    const last = summaryOf(free, base.history).highlights.at(-1);

    // Assert
    expect(last).toEqual({ tone: 'health', text: 'Health 84.7 B.' });
  });
});
