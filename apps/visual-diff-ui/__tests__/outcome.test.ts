// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.ts` include means tsc typechecks this file.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  formatStamp,
  type Outcome,
  durationOf,
  formatBytes,
  formatDay,
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

/**
 * The zone these two suites are read in.
 *
 * Pinned rather than inherited: the whole point of the change these tests guard
 * is that the answer now depends on the reader's clock, so a suite that took the
 * runner's zone would assert something different on every machine. Node re-reads
 * `TZ` on assignment, so this really does move the process — the same technique
 * PostMeta.test.tsx uses in packages/ui, and for the same reason.
 *
 * Madrid because it has an offset in both directions across the year (+2 in
 * August, +1 in January), which is what makes the DST case below a real one.
 */
const MADRID = 'Europe/Madrid';

/** No DST at all, and west of Greenwich rather than east, so the day rolls the
 *  other way. A second zone is what proves the answer is computed rather than
 *  hardcoded to one offset. */
const BOGOTA = 'America/Bogota';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('formatStamp', () => {
  it('splits the day from the time of day and drops the fraction', () => {
    vi.stubEnv('TZ', MADRID);

    expect(formatStamp('2026-08-21T12:51:23.716Z')).toBe('2026-08-21 14:51:23');
  });

  // `jobId` writes ids from stamps with the fraction already stripped, so both
  // spellings reach a history row.
  it('reads a stamp that carries no fractional seconds', () => {
    vi.stubEnv('TZ', MADRID);

    expect(formatStamp('2026-08-16T07:12:44Z')).toBe('2026-08-16 09:12:44');
  });

  /**
   * Parsed rather than sliced, and this is the case that pins it.
   *
   * The stored stamp says the 21st and the reader is shown the 22nd, because at
   * 23:30 UTC a clock in Madrid has already turned over. Slicing the stored
   * string cannot produce this — it can only ever echo the day the `Z` names —
   * so this assertion fails the moment anyone reverts to a substring.
   */
  it('rolls the day forward when the reader clock has already turned over', () => {
    vi.stubEnv('TZ', MADRID);

    expect(formatStamp('2026-08-21T23:30:00.000Z')).toBe('2026-08-22 01:30:00');
  });

  // And backward, from the other side of Greenwich. Together with the case
  // above, no fixed offset satisfies both.
  it('rolls the day back for a reader west of the stamp', () => {
    vi.stubEnv('TZ', BOGOTA);

    expect(formatStamp('2026-08-21T02:30:00Z')).toBe('2026-08-20 21:30:00');
  });

  /**
   * The offset is the one in force ON THAT INSTANT, not a constant for the zone.
   *
   * Madrid is +2 in August and +1 in January. An implementation that captured a
   * single offset — or that did the arithmetic by hand instead of letting `Date`
   * do it — passes every case above and fails this one.
   */
  it('reads a winter stamp at the winter offset', () => {
    vi.stubEnv('TZ', MADRID);

    expect(formatStamp('2026-01-16T07:12:44Z')).toBe('2026-01-16 08:12:44');
  });

  // A `history.json` some other tool wrote. Showing it whole is more use to
  // whoever has to explain it than showing the first nineteen characters.
  it('passes through anything that is not an ISO instant', () => {
    vi.stubEnv('TZ', MADRID);

    expect(formatStamp('yesterday')).toBe('yesterday');
    expect(formatStamp('2026-08-21')).toBe('2026-08-21');
  });

  // Right shape, impossible field: `\d{2}` admits a 13th month, and parsing one
  // yields `Invalid Date`. Passed through rather than rendered, so no cell can
  // ever read `NaN-NaN-NaN`.
  it('passes through a stamp of the right shape that names no real instant', () => {
    vi.stubEnv('TZ', MADRID);

    expect(formatStamp('2026-13-01T00:00:00Z')).toBe('2026-13-01T00:00:00Z');
  });
});

/**
 * The REPORTS date column, which has to agree with the HISTORY stamp beside it.
 *
 * Same clock, so the same day-rolling case is the one that matters: a run that
 * ended at 23:30 UTC belongs under the 22nd in both panels or in neither.
 */
describe('formatDay', () => {
  it('reads the local day, not the stored one', () => {
    vi.stubEnv('TZ', MADRID);

    expect(formatDay('2026-08-21T23:30:00.000Z')).toBe('2026-08-22');
  });

  it('rolls back for a reader west of the stamp', () => {
    vi.stubEnv('TZ', BOGOTA);

    expect(formatDay('2026-08-21T02:30:00Z')).toBe('2026-08-20');
  });

  it('agrees with the day formatStamp puts on the same instant', () => {
    vi.stubEnv('TZ', MADRID);

    const instant = '2026-08-21T23:30:00.000Z';

    expect(formatStamp(instant).startsWith(formatDay(instant))).toBe(true);
  });

  it('passes through anything that is not an ISO instant', () => {
    expect(formatDay('2026-08-21')).toBe('2026-08-21');
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
