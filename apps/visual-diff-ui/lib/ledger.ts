import * as fs from 'node:fs';
import { logger } from '@gate/logger';
import type { LedgerReport } from '@gate/visual-diff/ledger';
import { z } from 'zod';
import { resolveDataDir } from './data';
import { ledgerReportPath, reportDirOf } from './paths';

/**
 * What the spacing did on one variant, read back for the design view's panel.
 *
 * SERVER-ONLY, and the one import rule that matters here: nothing carrying
 * `'use client'` may reach this module at runtime — it opens a file.
 * `__tests__/config.test.ts` holds that structurally. The shapes the panel
 * renders come from `@gate/visual-diff/ledger` instead, which is an ambient
 * declaration with no runtime at all, so a client component naming
 * `LedgerReport` is safe by what it NAMES rather than by how the import was
 * written.
 *
 * A BULKHEAD, the other end of the one `lib/runner.ts` puts around pairing: a
 * sidecar that is missing, unreadable or not the shape it claims costs its own
 * panel and nothing else. It is never a throw and never a 500 — a reading is
 * reference beside a comparison, and the comparison is already on screen.
 *
 * It is NOT a `use cache` reader, unlike the four in lib/data.ts, which is why
 * it resolves the data directory itself rather than taking it as its first
 * argument: there is no cache key for the directory to have to join. One small
 * JSON file per comparison opened, on the one route that shows it.
 */

/** A reading's classification, as the file writes it. Transcribed rather than
 *  imported for the reason lib/summary.ts transcribes `BUCKETS`: the canonical
 *  array is `packages/visual-diff`'s own and its `exports` map does not publish
 *  it. The ambient `Classification` type is what keeps the two in step. */
const CLASSIFICATIONS = ['token', 'raw-on-scale', 'off-scale', 'exempt', 'none'] as const;

const ChangeSideSchema = z.object({
  px: z.number(),
  token: z.string().nullable(),
  /** `regular`, `user-agent`, `inline` or `unknown` — shown, never classified on. */
  origin: z.string(),
  classification: z.enum(CLASSIFICATIONS),
});

const LedgerChangeSchema = z.object({
  label: z.string(),
  property: z.string(),
  change: z.enum(['changed', 'appeared', 'gone', 'present']),
  before: ChangeSideSchema.nullable(),
  after: ChangeSideSchema.nullable(),
  /** `[x, y, width, height]` in the after screenshot's own pixels, or null when
   *  the element is gone and there is no after shot to point at. */
  rect: z.array(z.number()).nullable(),
});

export const LedgerReportSchema = z.object({
  // A literal, not a number, for the reason `SummarySchema` states: a bumped
  // version means a reader has to change to go on parsing the file.
  schema: z.literal(1),
  key: z.string(),
  /** Null when the after capture measured nothing — nothing to show a panel for. */
  mode: z.enum(['changed', 'after-only']).nullable(),
  origin: z.enum(['target', 'document']),
  changes: z.array(LedgerChangeSchema),
});

/** The file one comparison's readings sit in, or null for a report id this
 *  instance does not have and for a key that would climb out of it. */
async function ledgerFileFor(reportId: string, key: string): Promise<string | null> {
  const { dir } = await resolveDataDir();
  const reportDir = reportDirOf(dir, reportId);
  if (!reportDir) return null;

  try {
    return ledgerReportPath(reportDir, key);
  } catch {
    // `ledgerReportPath` throws on a climb, because its first caller is a
    // writer with nowhere to put a null. A reader has somewhere.
    return null;
  }
}

/**
 * One comparison's readings, or null when there are none to show.
 *
 * Silent for a comparison that simply has no sidecar: that is every compare
 * against `baselines` from before the console measured anything, and most
 * reports in a tree. Logged for a file that is there and will not be read —
 * unreadable, not JSON, or not the shape it claims — because that is a producer
 * or a disk saying something, and the panel's absence alone would not.
 */
export async function readLedgerReport(
  reportId: string,
  key: string,
): Promise<LedgerReport | null> {
  const file = await ledgerFileFor(reportId, key);
  if (file === null) return null;

  let raw: string;
  try {
    raw = await fs.promises.readFile(file, 'utf8');
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.warn(`could not read the ledger report ${file}`, cause);
    }

    return null;
  }

  try {
    return LedgerReportSchema.parse(JSON.parse(raw));
  } catch (cause) {
    logger.warn(`${file} does not match the ledger-report schema`, cause);

    return null;
  }
}
