import { LEDGER, parseVariantKey } from '@gate/visual-diff/policy';
import { z } from 'zod';
import { CANONICAL_LABEL } from './baselines';
import { resolveDataDir } from './data';
import { CLASSIFICATIONS } from './ledger';
import { entryUnder, setDirOf } from './paths';
import { everyReading, type Readings } from './readings';
import { readSidecar } from './sidecar';

/**
 * One screenshot's own token ledger, read back for the shot view's readings.
 *
 * SERVER-ONLY, for the reason lib/ledger.ts gives: it opens a file, so nothing
 * carrying `'use client'` may reach it. And a BULKHEAD the same way: a sidecar
 * that is missing, unreadable or not the shape it claims costs the panel and
 * nothing else — never a throw, never a 500. The screenshot and the board are
 * already worth reading without it.
 *
 * `baselines` reads as null without looking. The committed corpus never carries
 * a ledger — it is captured in CI, and nothing is written beside it (R-B3) — so
 * the answer is known before the disk is asked.
 */

const ReadingSchema = z.object({
  property: z.string(),
  px: z.number(),
  authored: z.string().nullable(),
  origin: z.string(),
  token: z.string().nullable(),
  classification: z.enum(CLASSIFICATIONS),
  reason: z.string().optional(),
});

/** The shape `serializeLedger` writes, which is the shape of the ambient `Ledger`. */
const LedgerSchema = z.object({
  schema: z.literal(1),
  key: z.string(),
  origin: z.enum(['target', 'document']),
  scale: z.record(z.string(), z.number()),
  elements: z.array(
    z.object({
      path: z.string(),
      label: z.string(),
      rect: z.array(z.number()),
      readings: z.array(ReadingSchema),
    }),
  ),
});

/** The sidecar beside one shot of one capture set, or null for a set this
 *  instance cannot name and a key that is no variant's. */
async function sidecarFor(label: string, key: string): Promise<string | null> {
  if (label === CANONICAL_LABEL || parseVariantKey(key) === null) return null;

  const { dir } = await resolveDataDir();
  const setDir = setDirOf(dir, label);

  return setDir === null ? null : entryUnder(setDir, `${key}${LEDGER.fileSuffix}`);
}

/**
 * Every reading one screenshot's capture measured, or null when there is no
 * ledger to read.
 *
 * Silent for a shot with no sidecar — every set captured before ledgers, and
 * every baselines shot. Logged for a file that is there and will not be read,
 * because that is a producer or a disk saying something.
 */
export async function readSetLedger(
  label: string,
  key: string,
): Promise<Readings | null> {
  const file = await sidecarFor(label, key);
  if (file === null) return null;

  const ledger = await readSidecar(file, LedgerSchema, 'token ledger');

  return ledger && everyReading(ledger);
}
