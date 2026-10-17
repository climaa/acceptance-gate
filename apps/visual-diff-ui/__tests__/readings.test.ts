// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.ts` include means tsc typechecks this file.
import { describe, expect, it } from 'vitest';
import type { Ledger, LedgerReport, Reading } from '@gate/visual-diff/ledger';
import { everyReading, pairedReadings } from '../lib/readings';

/**
 * The one shape the readings panel is handed: a paired report as it stands, or
 * one screenshot's own ledger read as every reading it holds.
 */

const KEY = 'atoms__desktop__light__atoms-badge--accent';

const reading = (over: Partial<Reading> = {}): Reading => ({
  property: 'padding-right',
  px: 8,
  authored: 'var(--space-2)',
  origin: 'regular',
  token: '--space-2',
  classification: 'token',
  ...over,
});

const ledger = (readings: Reading[], label = 'ds-badge'): Ledger => ({
  schema: 1,
  key: KEY,
  origin: 'target',
  scale: { '--space-1': 4, '--space-2': 8 },
  elements: [{ path: 'ds-badge', label, rect: [0, 4, 41.48, 20.8], readings }],
});

describe('everyReading', () => {
  it('reads one row per reading, in the order the ledger holds them', () => {
    const read = everyReading(
      ledger([reading({ property: 'padding-top' }), reading({ property: 'row-gap' })]),
    );

    expect(read.rows.map((row) => row.property)).toEqual(['padding-top', 'row-gap']);
  });

  it('reads each row as present on its one side, at the element it measured', () => {
    const [row] = everyReading(ledger([reading()])).rows;

    expect(row).toEqual({
      label: 'ds-badge',
      property: 'padding-right',
      change: 'present',
      before: null,
      after: { px: 8, token: '--space-2', origin: 'regular', classification: 'token' },
      rect: [0, 4, 41.48, 20.8],
    });
  });

  it('keeps an exemption’s reason beside its value', () => {
    const [row] = everyReading(
      ledger([
        reading({
          px: 2,
          token: null,
          classification: 'exempt',
          reason: 'pill half-step',
        }),
      ]),
    ).rows;

    expect(row?.after?.reason).toBe('pill half-step');
  });

  it('lists no reading that measured no spacing', () => {
    const read = everyReading(
      ledger([reading({ px: 0, token: null, classification: 'none' }), reading()]),
    );

    expect(read.rows).toHaveLength(1);
  });

  it('reads in every mode, under the key it was measured on', () => {
    const read = everyReading(ledger([]));

    expect({ key: read.key, mode: read.mode, rows: read.rows }).toEqual({
      key: KEY,
      mode: 'every',
      rows: [],
    });
  });
});

describe('pairedReadings', () => {
  it('passes a paired report through, its changes as the rows', () => {
    const report: LedgerReport = {
      key: KEY,
      mode: 'after-only',
      origin: 'target',
      changes: [],
    };

    expect(pairedReadings(report)).toEqual({ key: KEY, mode: 'after-only', rows: [] });
  });
});
