/**
 * The corpus-wide skip contract.
 *
 * `visual-diff:skip` is the only tag that takes a story out of the gate
 * altogether, and no story carries it. The ones that once did rendered no box
 * for the capturer to shoot; each is now shot inside an absence frame, whose
 * empty baseline says the state still leaves no ink. "This story cannot be
 * captured" and "this story is inconvenient to capture" are written identically,
 * and the gate cannot tell them apart. A skip added for the second reason still
 * exits 0; the only trace is one more name on the report's warning line, which
 * nobody diffs.
 *
 * So the set is pinned here rather than merely explained in the stories, for the
 * reason `apps/e2e/scripts/suite-integrity.mjs` pins EXPECTED_SCENARIOS: prose is
 * not a tripwire. Adding a skip is now a two-line diff that has to name the story
 * and say why, which is the review this decision deserves.
 *
 * Exact equality against an empty set. Adding an entry is the reviewed
 * direction, and should be rare: a state with no box gets an absence frame first.
 *
 * Lexical, deliberately: it reads the committed source rather than importing the
 * modules, so it sees what Storybook's static CSF indexer sees. Comments are
 * stripped first, because a docblock that discusses a tag is not a tag —
 * Dialog.stories.tsx names `visual-diff:fullpage` in prose and must not read as
 * carrying it.
 *
 * It keys on the FILE, so once a file is listed here a second skip inside it is
 * invisible to this test — the component's own `capture contract` block pins the
 * exact set of skipping exports for that reason, and those blocks are
 * load-bearing rather than decorative. The match is a substring, so a typo'd
 * `visual-diff:skipped` still reads as skipping. That is the safe direction: for
 * "has a new skip appeared", over-matching costs a look and under-matching costs
 * the guard.
 *
 * An empty scan cannot pass it: the scan is asserted non-empty first, so a glob
 * that stopped matching fails rather than approving silence.
 *
 * Structural, never appearance: which stories the gate shoots, never what any of
 * them looks like.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SKIP_TAG } from '@gate/visual-diff/policy';
import { describe, expect, it } from 'vitest';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Every story that opts out of capture, and why it cannot be captured.
 *
 * Paths, not story ids: an id is Storybook's own derivation from the title and
 * the export name, and recomputing it here would be a second implementation of
 * someone else's algorithm. Empty: SkipLink's `Default`, and the `null` renders
 * of TagList, StepList and Pagination, are shot inside absence frames instead.
 */
const EXPECTED_SKIPS: Readonly<Record<string, string>> = {};

/** Every story module committed under src/, as paths relative to it. */
const storyFilesOnDisk = () =>
  readdirSync(SRC, { recursive: true, encoding: 'utf8' })
    .map((entry) => entry.split(sep).join('/'))
    .filter((entry) => entry.endsWith('.stories.tsx'))
    .sort();

/** One story module's code, with comments blanked out. */
const codeOf = (file: string) =>
  readFileSync(join(SRC, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');

describe('the corpus-wide skip contract', () => {
  it('skips exactly the stories that cannot be captured', () => {
    const files = storyFilesOnDisk();
    const skipping = files.filter((file) => codeOf(file).includes(SKIP_TAG));

    expect(files.length).toBeGreaterThan(0);
    expect(skipping).toEqual(Object.keys(EXPECTED_SKIPS).sort());
  });
});
