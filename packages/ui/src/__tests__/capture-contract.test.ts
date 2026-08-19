/**
 * The corpus-wide skip contract.
 *
 * `visual-diff:skip` is the only tag that takes a story out of the gate
 * altogether. The two that carry it earn it — both render no box for the
 * capturer to shoot, and each says so beside itself — but "this story cannot be
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
 * Exact equality, not a floor — a floor of two would permit a third. REMOVING an
 * entry is the good direction and only ever means a story became capturable.
 *
 * Lexical, deliberately: it reads the committed source rather than importing the
 * modules, so it sees what Storybook's static CSF indexer sees. Comments are
 * stripped first, because a docblock that discusses a tag is not a tag —
 * Dialog.stories.tsx names `visual-diff:fullpage` in prose and must not read as
 * carrying it.
 *
 * Two things this deliberately does not reach, both covered where they belong.
 * It keys on the FILE, so a second skip added inside a file already listed here
 * is invisible to it — each component's own `capture contract` block pins the
 * exact set of skipping exports for that reason, and those blocks are
 * load-bearing rather than decorative. And the match is a substring, so a
 * typo'd `visual-diff:skipped` inside a listed file still reads as skipping;
 * the same blocks assert the tag equals SKIP_TAG exactly. The substring is the
 * safe direction here: for "has a new skip appeared", over-matching costs a
 * look and under-matching costs the guard.
 *
 * An empty scan cannot pass it: `EXPECTED_SKIPS` is non-empty, so a glob that
 * stopped matching fails on the comparison below rather than approving silence.
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
 * someone else's algorithm. The report prints the ids —
 * `atoms-skiplink--default` and `molecules-taglist--empty`.
 */
const EXPECTED_SKIPS: Readonly<Record<string, string>> = {
  // Unfocused, `.ds-visually-hidden` clips the link to nothing. `Revealed` is
  // the story that baselines it on screen, and SkipLink.test.tsx holds it there.
  'atoms/SkipLink/SkipLink.stories.tsx': 'no box: clipped until focused',
  // An empty tag array renders `null`, so there is no `#storybook-root` box.
  // `ThreeTags` and `OneTag` stay captured; TagList.test.tsx holds them there.
  'molecules/TagList/TagList.stories.tsx': 'no box: renders null',
};

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
    const skipping = storyFilesOnDisk().filter((file) => codeOf(file).includes(SKIP_TAG));

    expect(skipping).toEqual(Object.keys(EXPECTED_SKIPS).sort());
  });
});
