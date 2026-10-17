import type {
  ChangeSide,
  Ledger,
  LedgerChange,
  LedgerReport,
} from '@gate/visual-diff/ledger';

/**
 * What the spacing readings panel is handed, whichever way in it was reached.
 *
 * A report's design view reads a `LedgerReport`: what the spacing DID between two
 * captures, paired by `packages/visual-diff`. A screenshot opened from a set has
 * no second capture to pair with, so it reads its own sidecar as it stands —
 * every reading, in the same row shape, under a third mode of its own. One shape
 * for both is what lets the panel, its boxes and its press stay one component.
 *
 * Pure and client-safe: the types are ambient (types/visual-diff/ledger.d.ts) and
 * nothing here opens a file. lib/set-ledger.ts is the server half that reads one.
 */

/** How many sides the readings had, which decides what the panel can say:
 *  `changed` and `after-only` come from a pairing, `every` from one screenshot. */
export type ReadingsMode = NonNullable<LedgerReport['mode']> | 'every';

/** One side of a reading. An exemption's reason rides along where the source
 *  carries it — a screenshot's own sidecar does, a paired report does not. */
export type ReadingSide = ChangeSide & { reason?: string };

export type ReadingRow = Omit<LedgerChange, 'before' | 'after'> & {
  before: ReadingSide | null;
  after: ReadingSide | null;
};

export interface Readings {
  /** The variant the readings were measured on: the panel shows them beside
   *  that screenshot and no other. */
  key: string;
  /** Null when the capture measured nothing — no ledger to show a panel for. */
  mode: ReadingsMode | null;
  rows: readonly ReadingRow[];
}

/** A paired report, read as the panel reads everything. */
export const pairedReadings = (report: LedgerReport): Readings => ({
  key: report.key,
  mode: report.mode,
  rows: report.changes,
});

/**
 * Every reading one screenshot's ledger holds, one row each: what `every` lists.
 *
 * In the ledger's own order — document order, then the policy's property order,
 * which `serializeLedger` already wrote them in — so nothing is sorted here.
 * `none` is skipped, as the pairing skips it: zero padding and a `normal` gap say
 * "no spacing", and a row for each would bury the spacing there is.
 *
 * `present` is the pairing's own word for a reading read off one side alone,
 * which is exactly what this is.
 */
export function everyReading(ledger: Ledger): Readings {
  const rows = ledger.elements.flatMap((element) =>
    element.readings
      .filter((reading) => reading.classification !== 'none')
      .map((reading): ReadingRow => ({
        label: element.label,
        property: reading.property,
        change: 'present',
        before: null,
        after: {
          px: reading.px,
          token: reading.token,
          origin: reading.origin,
          classification: reading.classification,
          ...(reading.reason === undefined ? {} : { reason: reading.reason }),
        },
        rect: element.rect,
      })),
  );

  return { key: ledger.key, mode: 'every', rows };
}
