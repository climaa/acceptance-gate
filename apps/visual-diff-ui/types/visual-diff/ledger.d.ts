/**
 * `@gate/visual-diff/ledger`, declared for this app rather than inferred from its
 * source — see ./compare.d.ts for why every module beside it does the same, and
 * for the bargain that strikes.
 *
 * Narrowed to what the report writer calls and what the design view's readings
 * panel renders: a ledger as it reads one off a capture set, the pairing of two of
 * them, the bytes a report is written as, and the shapes that report holds. The
 * walk, the cascade and the classifier are the package's own business, exercised
 * by its own suite.
 *
 * The SHAPES being declared here is what lets a client component name them. This
 * file has no runtime at all, so `LedgerReport` in a `'use client'` module can
 * never become a value import that drags `node:fs` into a browser bundle — which
 * is the trap `__tests__/config.test.ts` describes, and the reason lib/ledger.ts
 * exports a reader and a schema but no shape of its own.
 *
 * What holds the transcription honest is `__tests__/runner.test.ts`, which pairs
 * two real sidecars and reads the report back, and `__tests__/ledger.test.ts`,
 * which parses one with the app's own schema — a changed signature or a changed
 * field fails one of those rather than passing quietly.
 */

declare module '@gate/visual-diff/ledger' {
  /** A reading's classification: a design token, a raw value on the scale,
   *  off-scale, exempt, or no spacing at all. Describes the value; it is never a
   *  verdict, which belongs to a comparison. */
  export type Classification = 'token' | 'raw-on-scale' | 'off-scale' | 'exempt' | 'none';

  /** One measured property of one element, with its classification. */
  export interface Reading {
    property: string;
    px: number;
    authored: string | null;
    origin: string;
    token: string | null;
    classification: Classification;
    reason?: string;
  }

  export interface LedgerElement {
    path: string;
    label: string;
    rect: readonly number[];
    readings: readonly Reading[];
  }

  /** The spacing one capture measured on one variant, beside its screenshot. */
  export interface Ledger {
    schema: 1;
    key: string;
    /** What `rect` is measured from. */
    origin: 'target' | 'document';
    scale: Readonly<Record<string, number>>;
    elements: readonly LedgerElement[];
  }

  /** One side of a change: the value, what names it, and where it was written. */
  export interface ChangeSide {
    px: number;
    token: string | null;
    origin: string;
    classification: Classification;
  }

  export interface LedgerChange {
    label: string;
    property: string;
    change: 'changed' | 'appeared' | 'gone' | 'present';
    before: ChangeSide | null;
    after: ChangeSide | null;
    /** The after rect, or null when the element is gone. */
    rect: readonly number[] | null;
  }

  export interface LedgerReport {
    key: string;
    mode: 'changed' | 'after-only' | null;
    origin: 'target' | 'document';
    changes: readonly LedgerChange[];
  }

  /** What the spacing did between two captures of one variant. `after-only` when
   *  there is no before ledger to compare against — which is every compare against
   *  the committed `baselines`, since those carry none. */
  export function pairLedgers(
    before: Ledger | null,
    after: Ledger | null,
  ): { mode: 'changed' | 'after-only' | null; changes: LedgerChange[] };

  /** A report as the bytes a file holds: the same report is always the same bytes. */
  export function serializeLedgerReport(report: LedgerReport): string;
}
