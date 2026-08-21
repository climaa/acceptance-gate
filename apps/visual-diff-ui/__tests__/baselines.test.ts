import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.ts` include means tsc typechecks this file.
import { afterAll, describe, expect, it } from 'vitest';
import { CANONICAL_LABEL, baselinesPath, readCanonicalSet } from '../lib/baselines';
import { SetLabelSchema } from '../lib/jobs';

/**
 * The committed baseline corpus, read as something to compare against.
 *
 * Driven by written directories rather than by the repo's own corpus, because
 * what has to be pinned is what an ABSENT or EMPTY one does — and neither is
 * something to do to `packages/visual-diff/__baselines__` to prove it.
 */

const REPO_ROOT = path.resolve(process.cwd(), '..', '..');
const temporaryDirs: string[] = [];

/** A checkout whose corpus holds these files. */
function checkoutWith(names: readonly string[]): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-baselines-'));
  temporaryDirs.push(root);
  const dir = baselinesPath(root);
  fs.mkdirSync(dir, { recursive: true });
  for (const name of names) fs.writeFileSync(path.join(dir, name), 'x'.repeat(10));

  return root;
}

afterAll(() => {
  for (const dir of temporaryDirs) fs.rmSync(dir, { recursive: true, force: true });
});

describe('the canonical label', () => {
  // It travels through the compare pickers and `POST /api/jobs`, both of which
  // validate a label's shape. `__baselines__` — the directory's own name — would
  // be refused by that schema, which is why the label is not it.
  it('is a label the job schema accepts', () => {
    expect(SetLabelSchema.safeParse(CANONICAL_LABEL).success).toBe(true);
  });
});

describe('readCanonicalSet', () => {
  it('counts the shots and measures them', async () => {
    const corpus = await readCanonicalSet(
      checkoutWith(['a__b__c__d.png', 'e__f__g__h.png', 'BASELINE_ENV.json']),
    );

    expect(corpus).toMatchObject({ label: CANONICAL_LABEL, stories: 2, bytes: 20 });
  });

  // The stamp is not a shot. Counting it would report a corpus one story larger
  // than the matrix it covers.
  it('does not count the host stamp as a shot', async () => {
    const corpus = await readCanonicalSet(
      checkoutWith(['a__b__c__d.png', 'BASELINE_ENV.json']),
    );

    expect(corpus?.stories).toBe(1);
  });

  // Three cases, one answer, and deliberately not distinguished: no checkout, no
  // directory, or a directory with no shots is a console with nothing canonical
  // to compare against.
  it('answers with nothing outside a checkout', async () => {
    expect(await readCanonicalSet(null)).toBeNull();
  });

  it('answers with nothing when the corpus is not there', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-baselines-'));
    temporaryDirs.push(root);

    expect(await readCanonicalSet(root)).toBeNull();
  });

  it('answers with nothing for a corpus holding no shots', async () => {
    expect(await readCanonicalSet(checkoutWith(['BASELINE_ENV.json']))).toBeNull();
  });

  // A written temp checkout is not a git repository, so there is no commit to
  // read. Null rather than a guess: the row draws a dash, and inventing a sha
  // would attribute the corpus to a commit that never touched it.
  it('reports no commit where git cannot say', async () => {
    const corpus = await readCanonicalSet(checkoutWith(['a__b__c__d.png']));

    expect(corpus?.sha).toBeNull();
    expect(corpus?.acceptedAt).toBeNull();
  });

  // This repo's own corpus, which IS in git — so the commit that last accepted it
  // is readable, and that is the provenance the row shows.
  it("reads this repo's corpus and the commit that accepted it", async () => {
    const corpus = await readCanonicalSet(REPO_ROOT);

    expect(corpus?.stories).toBeGreaterThan(0);
    expect(corpus?.sha).toMatch(/^[0-9a-f]{7,}$/);
    expect(corpus?.acceptedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
