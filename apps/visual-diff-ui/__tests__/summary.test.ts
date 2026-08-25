import * as fs from 'node:fs';
import * as path from 'node:path';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.ts` include means tsc typechecks this file.
import { describe, expect, it } from 'vitest';
import { BUCKETS, SetsFileSchema, SummarySchema } from '../lib/summary';

/**
 * The committed fixture is the conformance fixture: `fixtures/**` is evidence
 * of a real run (the #242 regression, seen backwards through the differ), and
 * the schemas conform to it, never the reverse. A failure here is schema drift
 * — the fixture is not edited to make this pass.
 */

const FIXTURES = path.resolve(__dirname, '..', 'fixtures');
const REPORT_ID = 'main-2026-08-17__main-2026-08-13';
/** The second committed report, carrying the `added` verdict the first has none
 *  of. Conformance is per report, not per tree: a summary the schema cannot
 *  parse is a report the console 500s on, whichever of them it is. */
const ADDED_REPORT_ID = 'baselines__main-2026-08-24';

const readJson = (...segments: string[]): unknown =>
  JSON.parse(fs.readFileSync(path.join(FIXTURES, ...segments), 'utf8'));

describe('SummarySchema', () => {
  it.each([REPORT_ID, ADDED_REPORT_ID])('parses %s verbatim', (id) => {
    const raw = readJson('reports', id, 'summary.json');

    const result = SummarySchema.safeParse(raw);

    expect(result.error?.issues ?? []).toEqual([]);
  });

  it.each([REPORT_ID, ADDED_REPORT_ID])('keeps every field %s carries', (id) => {
    const raw = readJson('reports', id, 'summary.json');

    const summary = SummarySchema.parse(raw);

    expect(summary).toEqual(raw);
  });

  it('rejects a summary written against a future schema version', () => {
    const raw = readJson('reports', REPORT_ID, 'summary.json') as Record<string, unknown>;

    const result = SummarySchema.safeParse({ ...raw, schemaVersion: 2 });

    expect(result.success).toBe(false);
  });

  it('rejects a bucket the differ never produces', () => {
    const raw = readJson('reports', REPORT_ID, 'summary.json') as {
      variants: Record<string, unknown>[];
    };
    const [first, ...rest] = raw.variants;

    const result = SummarySchema.safeParse({
      ...raw,
      variants: [{ ...first, bucket: 'flaky' }, ...rest],
    });

    expect(result.success).toBe(false);
  });

  it('rejects counts missing a bucket', () => {
    const raw = readJson('reports', REPORT_ID, 'summary.json') as {
      counts: Record<string, number>;
    };
    const { a11y: _dropped, ...partial } = raw.counts;

    const result = SummarySchema.safeParse({ ...raw, counts: partial });

    expect(result.success).toBe(false);
  });
});

describe('the bucket vocabulary', () => {
  // The app-side list is a transcription — packages/visual-diff owns the
  // canonical array but does not export it (see lib/summary.ts). `counts` is
  // written from that array, for every bucket, on every run: the fixture is
  // therefore the evidence that the transcription still matches the producer.
  it('matches the buckets the producing run counted', () => {
    const raw = readJson('reports', REPORT_ID, 'summary.json') as {
      counts: Record<string, number>;
    };

    expect(Object.keys(raw.counts)).toEqual([...BUCKETS]);
  });
});

describe('SetsFileSchema', () => {
  it('parses the committed sets.json verbatim', () => {
    const raw = readJson('sets.json');

    const result = SetsFileSchema.safeParse(raw);

    expect(result.error?.issues ?? []).toEqual([]);
  });

  it('keeps every field the fixture carries', () => {
    const raw = readJson('sets.json');

    const sets = SetsFileSchema.parse(raw);

    expect(sets).toEqual(raw);
  });

  it('rejects a set missing its capture sha', () => {
    const raw = readJson('sets.json') as { sets: Record<string, unknown>[] };
    const [first, ...rest] = raw.sets;
    const { sha: _dropped, ...incomplete } = first ?? {};

    const result = SetsFileSchema.safeParse({ ...raw, sets: [incomplete, ...rest] });

    expect(result.success).toBe(false);
  });
});
