// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.ts` include means tsc typechecks this file.
import { afterEach, describe, expect, it } from 'vitest';
import { CanonicalSet } from '../components/CanonicalSet';
import type { CanonicalSet as Corpus } from '../lib/baselines';

/**
 * The committed corpus, as the console draws it.
 *
 * Reached only through `DashboardTemplate`, which renders it from the fixture —
 * and the fixture is a healthy checkout, so the row has always been drawn with a
 * sha and a date. The branch nothing exercised is the other one: a corpus git
 * could not describe, which is what an instance running outside a checkout has,
 * and what any instance has when `git log` fails.
 *
 * It matters because the fallback is a claim. An em dash says "this is not
 * recorded"; a blank cell says nothing at all, and a zero would say the corpus is
 * empty when it is only unattributed.
 */

afterEach(cleanup);

const corpus = (overrides: Partial<Corpus> = {}): Corpus => ({
  label: 'baselines',
  sha: '43b49eb1c0ffee0000',
  acceptedAt: '2026-08-25',
  stories: 158,
  bytes: 1_700_000,
  ...overrides,
});

describe('a corpus git could describe', () => {
  it('shortens the accepting commit to seven characters', () => {
    render(<CanonicalSet corpus={corpus()} />);

    expect(screen.getByText('43b49eb')).toBeTruthy();
    expect(screen.queryByText('43b49eb1c0ffee0000')).toBeNull();
  });

  it('shows the label, the date and the counts', () => {
    render(<CanonicalSet corpus={corpus()} />);

    expect(screen.getByText('baselines')).toBeTruthy();
    expect(screen.getByText('2026-08-25')).toBeTruthy();
    expect(screen.getByText('158')).toBeTruthy();
  });

  /** The corpus is committed, so it is the one set the console marks rather than
   *  offers to delete. */
  it('marks it canonical', () => {
    render(<CanonicalSet corpus={corpus()} />);

    expect(screen.getByText('canonical')).toBeTruthy();
  });
});

/**
 * The branch the fixture never produces: an instance outside a checkout, or one
 * whose `git log` did not answer.
 */
describe('a corpus git could not describe', () => {
  it('says the provenance is unrecorded rather than leaving it blank', () => {
    render(<CanonicalSet corpus={corpus({ sha: null, acceptedAt: null })} />);

    expect(screen.getAllByText('—')).toHaveLength(2);
  });

  it('still reports what it can count off the disk', () => {
    render(<CanonicalSet corpus={corpus({ sha: null, acceptedAt: null })} />);

    // Stories and bytes come from the tree, not from git — a corpus with no
    // provenance is still a corpus with shots in it.
    expect(screen.getByText('158')).toBeTruthy();
    expect(screen.getByText('baselines')).toBeTruthy();
  });

  it('reads an empty corpus as zero rather than unknown', () => {
    render(<CanonicalSet corpus={corpus({ stories: 0, bytes: 0 })} />);

    expect(screen.getByText('0')).toBeTruthy();
  });
});
