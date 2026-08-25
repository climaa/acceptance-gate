import { THEMES, TIERS, VIEWPORTS } from '@gate/visual-diff/policy';
import { z } from 'zod';

/**
 * The read schema for `packages/visual-diff`'s own artifacts, app-side.
 *
 * The differ writes `summary.json`; this app is one of its readers, and a
 * reader that trusts the shape it happens to receive turns a producer change
 * into a runtime crash three screens deep. Parsing at the boundary makes the
 * failure land once, at the read, naming the file.
 *
 * Every enum comes from `@gate/visual-diff/policy`, the one place those
 * literals are written — with one exception, `BUCKETS` below.
 */

const VIEWPORT_NAMES = Object.keys(VIEWPORTS) as (keyof typeof VIEWPORTS)[];

/**
 * The one enum this file transcribes rather than imports. The canonical array
 * lives in `packages/visual-diff/src/artifacts.mjs`, which the package's
 * `exports` map does not publish — and extending that package is explicitly not
 * this app's to do. `__tests__/summary.test.ts` closes the loop against the
 * committed fixture, whose `counts` object the producer writes from the
 * canonical array, in canonical order, on every run.
 */
export const BUCKETS = [
  'unchanged',
  'changed',
  'added',
  'removed',
  'errored',
  'a11y',
] as const;

export type Bucket = (typeof BUCKETS)[number];

const ViolationSchema = z.object({ id: z.string(), nodes: z.number() });

export const VariantSchema = z.object({
  /** `${tier}__${viewport}__${theme}__${storyId}` — also the shot filename stem. */
  key: z.string(),
  id: z.string(),
  tier: z.enum(TIERS),
  viewport: z.enum(VIEWPORT_NAMES),
  theme: z.enum(THEMES),
  bucket: z.enum(BUCKETS),
  overlapDiffPixels: z.number(),
  marginPixels: z.number(),
  diffPixels: z.number(),
  allowedDiffPixels: z.number(),
  /** Null for a variant that never had a candidate to measure — `removed`, `errored`. */
  width: z.number().nullable(),
  height: z.number().nullable(),
  /** e.g. `"1248×469 → 1248×429"`, null when the two shots agree on size. */
  sizeDelta: z.string().nullable(),
  violations: z.array(ViolationSchema),
  error: z.string().nullable(),
});

export type Variant = z.infer<typeof VariantSchema>;

export const SummarySchema = z.object({
  // A literal, not a number: a bumped version means a reader has to change to
  // keep parsing the file, which is exactly the moment to fail loudly.
  schemaVersion: z.literal(1),
  exitCode: z.number(),
  thresholds: z.object({ maxDiffPixels: z.number(), maxDiffRatio: z.number() }),
  /** platform / arch / image / playwright — the host the run is comparable to. */
  env: z.record(z.string(), z.string()),
  counts: z.record(z.enum(BUCKETS), z.number()),
  warnings: z.array(z.string()),
  /** Carried by the committed fixture. Provenance only — see lib/data.ts. */
  isSample: z.boolean().optional(),
  variants: z.array(VariantSchema),
});

export type Summary = z.infer<typeof SummarySchema>;

export const SetSchema = z.object({
  label: z.string(),
  sha: z.string(),
  branch: z.string(),
  capturedAt: z.string(),
  stories: z.number(),
  /** The working tree carried uncommitted changes when the set was captured. */
  dirty: z.boolean().optional(),
  note: z.string().optional(),
});

export type CaptureSet = z.infer<typeof SetSchema>;

export const SetsFileSchema = z.object({
  isSample: z.boolean().optional(),
  sets: z.array(SetSchema),
});

export type SetsFile = z.infer<typeof SetsFileSchema>;

/**
 * How many variants of a report a reviewer is shown.
 *
 * Everything but `unchanged`: the differ drops unchanged variants before
 * `summary.variants` is written, so they are cards nobody can open, and counting
 * them would leave the review bar reading 6/106 on a run where six things moved
 * and a hundred did not.
 */
export function reviewableCount(counts: Record<Bucket, number>): number {
  return Object.entries(counts)
    .filter(([bucket]) => bucket !== 'unchanged')
    .reduce((total, [, count]) => total + count, 0);
}
