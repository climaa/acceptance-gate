import { describe, expect, it } from 'vitest';

import { EXIT } from '../policy.mjs';
import { buildSummary, renderSummaryMd } from '../artifacts.mjs';

const ENV = {
  platform: 'linux',
  arch: 'x64',
  image: 'v1.62.1-noble',
  playwright: '1.62.1',
};

/** A comparison row, shaped like `compare.mjs`'s `Comparison`. Built by hand rather
 *  than through `compareAll` — artifacts.mjs is pure rendering over the row shape, and
 *  the pixel math that produces it is compare.mjs's own suite. */
function row(overrides = {}) {
  return {
    key: 'atoms__desktop__light__button--primary',
    id: 'button--primary',
    tier: 'atoms',
    viewport: 'desktop',
    theme: 'light',
    bucket: 'unchanged',
    pass: true,
    overlapDiffPixels: 0,
    marginPixels: 0,
    diffPixels: 0,
    allowedDiffPixels: 40,
    width: 200,
    height: 100,
    sizeDelta: null,
    violations: [],
    error: null,
    diff: null,
    ...overrides,
  };
}

const changedRow = (overrides = {}) =>
  row({
    bucket: 'changed',
    pass: false,
    overlapDiffPixels: 312,
    diffPixels: 312,
    diff: new Uint8Array([1, 2, 3]),
    ...overrides,
  });

describe('buildSummary', () => {
  it('produces byte-identical JSON for the same inputs regardless of array order', () => {
    const a = row({ key: 'a', id: 'a' });
    const b = changedRow({ key: 'b', id: 'b', overlapDiffPixels: 10 });
    const c = changedRow({ key: 'c', id: 'c', overlapDiffPixels: 50 });

    const first = JSON.stringify(buildSummary([a, b, c], ENV));
    const second = JSON.stringify(buildSummary([c, a, b], ENV));

    expect(first).toBe(second);
  });

  it('never carries a timestamp', () => {
    const summary = buildSummary([row(), changedRow()], ENV);
    const json = JSON.stringify(summary);

    expect(json).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(json.toLowerCase()).not.toContain('timestamp');
  });

  it('omits unchanged rows from variants[] but counts them', () => {
    const summary = buildSummary(
      [row({ key: 'u1' }), row({ key: 'u2' }), changedRow({ key: 'c1' })],
      ENV,
    );

    expect(summary.variants).toHaveLength(1);
    expect(summary.variants[0].key).toBe('c1');
    expect(summary.counts).toEqual({
      unchanged: 2,
      changed: 1,
      added: 0,
      removed: 0,
      errored: 0,
      a11y: 0,
    });
  });

  it('reports exitCode 0 when every row is unchanged, 1 when any is not', () => {
    const clean = buildSummary([row(), row({ key: 'k2' })], ENV);
    const dirty = buildSummary([row(), changedRow()], ENV);

    expect(clean.exitCode).toBe(EXIT.ok);
    expect(dirty.exitCode).toBe(EXIT.diff);
  });

  it('is unaffected by mutating the input rows after building', () => {
    const input = [changedRow({ key: 'c1', overlapDiffPixels: 100 })];
    const summary = buildSummary(input, ENV);

    input[0].overlapDiffPixels = 999_999;
    input.push(changedRow({ key: 'c2', overlapDiffPixels: 5 }));

    expect(summary.variants).toHaveLength(1);
    expect(summary.variants[0].overlapDiffPixels).toBe(100);
  });
});

describe('renderSummaryMd', () => {
  it('caps the table at 20 rows with an overflow line', () => {
    const rows = Array.from({ length: 25 }, (_, index) =>
      changedRow({
        key: `k${index}`,
        id: `story-${index}`,
        overlapDiffPixels: 25 - index,
      }),
    );
    const summary = buildSummary(rows, ENV);
    const md = renderSummaryMd(summary);

    const tableRows = md.split('\n').filter((line) => line.startsWith('| story-'));
    expect(tableRows).toHaveLength(20);
    expect(md).toContain('_...and 5 more._');
  });

  it('round-trips a pipe and a -- run in a story id', () => {
    const summary = buildSummary([changedRow({ id: 'weird--id|with-pipe' })], ENV);
    const md = renderSummaryMd(summary);

    expect(md).toContain('weird--id\\|with-pipe');
  });

  it('renders a11y violations as rule-id (n)', () => {
    const summary = buildSummary(
      [
        changedRow({
          bucket: 'a11y',
          id: 'card--default',
          violations: [
            { id: 'color-contrast', nodes: 2 },
            { id: 'image-alt', nodes: 1 },
          ],
        }),
      ],
      ENV,
    );
    const md = renderSummaryMd(summary);

    expect(md).toContain('color-contrast (2)');
    expect(md).toContain('image-alt (1)');
  });

  it('renders a warnings section from a summary it did not build', () => {
    const { variants } = buildSummary([changedRow({ id: 'hand-built' })], ENV);
    const summary = {
      schemaVersion: 1,
      exitCode: EXIT.diff,
      thresholds: { maxDiffPixels: 40, maxDiffRatio: 0.0005 },
      env: ENV,
      counts: { unchanged: 0, changed: 1, added: 0, removed: 0, errored: 0, a11y: 0 },
      warnings: ['baselines are at 92% of budget'],
      variants,
    };

    const md = renderSummaryMd(summary);

    expect(md).toContain('### Warnings');
    expect(md).toContain('- baselines are at 92% of budget');
    expect(md).toContain('| hand-built |');
  });

  it('prints a baseline that names no cell of the matrix under ?/?/?', () => {
    const key = 'atoms__desktop__retired__card--default';
    const orphan = row({
      key,
      id: key,
      tier: null,
      viewport: null,
      theme: null,
      bucket: 'removed',
      pass: false,
      width: null,
      height: null,
      allowedDiffPixels: 0,
      error: `${key} names no cell of the capture matrix`,
    });
    const summary = buildSummary([orphan], ENV);

    const md = renderSummaryMd(summary);

    expect(md).toContain(`| ${key} | ?/?/? | 0 | 0 | 0.00× | — |`);
  });

  it('shows a clean verdict and omits the table and remediation footer when nothing changed', () => {
    const summary = buildSummary([row(), row({ key: 'k2' })], ENV);
    const md = renderSummaryMd(summary);

    expect(md).toContain('✅ no changes');
    expect(md).not.toContain('story');
    expect(md).not.toContain('To fix');
  });

  it('remediates with a container-only recipe, not a bare-metal command', () => {
    const summary = buildSummary([row(), changedRow()], ENV);

    const md = renderSummaryMd(summary);

    expect(md).toContain('### To fix');
    // No CLI commands in the summary: off the pinned platform `pnpm visual-diff` fails
    // on the host guard, and a bare `cli.mjs accept` has none and corrupts the corpus.
    // (`pnpm visual-diff:accept` is container-bound now, but the README stays the one
    // place the recipe lives — the summary links it rather than restating commands.)
    expect(md).not.toContain('pnpm visual-diff`');
    expect(md).not.toContain('pnpm visual-diff:accept`');
    expect(md).toContain('inside the pinned container');
    expect(md).toContain('no host guard');
    expect(md).toContain('packages/visual-diff/README.md');
  });

  it('formats a size change and a strict-mode (zero-allowance) ratio', () => {
    const summary = buildSummary(
      [
        changedRow({ sizeDelta: '200×100 → 200×228' }),
        changedRow({
          key: 'strict',
          id: 'strict-one',
          allowedDiffPixels: 0,
          diffPixels: 5,
        }),
      ],
      ENV,
    );
    const md = renderSummaryMd(summary);

    expect(md).toContain('200×100 → 200×228');
    expect(md).toContain('∞×');
  });
});
