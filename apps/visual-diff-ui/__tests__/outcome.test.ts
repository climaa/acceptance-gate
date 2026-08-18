// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.ts` include means tsc typechecks this file.
import { describe, expect, it } from 'vitest';
import {
  type Outcome,
  durationOf,
  formatBytes,
  formatDuration,
  outcomeOf,
  outcomeTone,
} from '../lib/outcome';

/**
 * The history vocabulary, which is a contract twice over: the words come from
 * the CLI's exit codes, and the e2e scenario reads them off the page.
 *
 * Every assertion here is a strict equality on the whole string. `succeeded`
 * is a substring of `succeeded (diffs)`, so a `toContain` would pass for the
 * one verdict the gate exists to keep separate from a clean run.
 */

describe('outcomeOf', () => {
  it('calls exit 0 succeeded', () => {
    expect(outcomeOf(0)).toBe('succeeded');
  });

  it('calls exit 1 succeeded (diffs)', () => {
    expect(outcomeOf(1)).toBe('succeeded (diffs)');
  });

  // The whole reason the two words are not one: a run with diffs is a report to
  // read, and reading it as clean would retire the review before it happened.
  it('never reports exit 1 as a clean run', () => {
    expect(outcomeOf(1)).not.toBe('succeeded');
  });

  it('calls exit 2 failed', () => {
    expect(outcomeOf(2)).toBe('failed');
  });

  // The CLI's codes stop at 2; a runner killed by a signal, or a future code,
  // is still the gate having broken rather than a verdict.
  it('calls any code above 2 failed', () => {
    expect(outcomeOf(137)).toBe('failed');
  });

  it('calls a run with no recorded exit interrupted', () => {
    expect(outcomeOf(null)).toBe('interrupted');
  });
});

describe('outcomeTone', () => {
  const CASES: [Outcome, string][] = [
    ['succeeded', 'success'],
    ['succeeded (diffs)', 'warning'],
    ['failed', 'danger'],
    ['interrupted', 'muted'],
  ];

  it.each(CASES)('colours %s with the %s role', (outcome, tone) => {
    expect(outcomeTone(outcome)).toBe(tone);
  });
});

describe('formatDuration', () => {
  it('spells a duration over a minute as minutes and seconds', () => {
    expect(formatDuration(95_000)).toBe('1m 35s');
  });

  it('drops the minutes under a minute', () => {
    expect(formatDuration(42_000)).toBe('42s');
  });

  it('floors the seconds rather than rounding into the next one', () => {
    expect(formatDuration(59_999)).toBe('59s');
  });

  it('keeps the minutes when the seconds land on zero', () => {
    expect(formatDuration(120_000)).toBe('2m 0s');
  });
});

describe('durationOf', () => {
  it('measures the span between the two stamps', () => {
    expect(durationOf('2026-08-17T08:00:00Z', '2026-08-17T08:01:35Z')).toBe(95_000);
  });

  // What an interrupted run leaves behind: a start and nothing else.
  it('has nothing to measure for a run that never ended', () => {
    expect(durationOf('2026-08-17T08:00:00Z', null)).toBe(null);
  });

  it('has nothing to measure when a stamp is not a date', () => {
    expect(durationOf('the other day', '2026-08-17T08:01:35Z')).toBe(null);
  });

  // A clock that went backwards mid-run, or two stamps written out of order:
  // "-3s" in the table is worse than admitting the pair says nothing.
  it('has nothing to measure when the run ended before it started', () => {
    expect(durationOf('2026-08-17T08:01:35Z', '2026-08-17T08:00:00Z')).toBe(null);
  });
});

describe('formatBytes', () => {
  it('leaves a size under a kilobyte in bytes', () => {
    expect(formatBytes(999)).toBe('999 B');
  });

  it('spells a megabyte-scale set the way the board draws it', () => {
    expect(formatBytes(95_500_000)).toBe('95.5 MB');
  });

  it('steps up to the next unit at a thousand', () => {
    expect(formatBytes(1000)).toBe('1.0 kB');
  });

  it('stops scaling at gigabytes', () => {
    expect(formatBytes(2_500_000_000)).toBe('2.5 GB');
  });

  // A set whose directory this instance has never seen: measured, and found to
  // hold nothing.
  it('reports an empty set as zero bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
  });
});
