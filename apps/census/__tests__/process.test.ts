import { describe, expect, it } from 'vitest';

import { inWorkspace, testedAsProcess } from '@/lib/collect/process.ts';

/** One child's NODE_V8_COVERAGE file, as Node writes it: only `result[].url` is read. */
const coverageFile = (...urls: string[]) =>
  JSON.stringify({ result: urls.map((url, i) => ({ scriptId: String(i), url })) });

const VITEST =
  'file:///repo/node_modules/.pnpm/vitest@4.1.0/node_modules/vitest/dist/cli.js';

describe('testedAsProcess', () => {
  it('names a file a child ran in place', () => {
    const files = ['scripts/gate/run.mjs', 'scripts/gate/lock.mjs'];
    const child = coverageFile('node:fs', 'file:///repo/scripts/gate/run.mjs');

    const reached = testedAsProcess([child], files);

    expect([...reached]).toEqual(['scripts/gate/run.mjs']);
  });

  it('names a file a child ran from a copy in another directory', () => {
    const child = coverageFile('file:///tmp/gate-abc123/scripts/gate/receipt.mjs');

    const reached = testedAsProcess([child], ['scripts/gate/receipt.mjs']);

    expect([...reached]).toEqual(['scripts/gate/receipt.mjs']);
  });

  it('decodes the URL before matching it', () => {
    const child = coverageFile(
      'file:///tmp/my%20repo/apps/e2e/scripts/seed-visual-diff.mjs',
    );

    const reached = testedAsProcess([child], ['apps/e2e/scripts/seed-visual-diff.mjs']);

    expect([...reached]).toEqual(['apps/e2e/scripts/seed-visual-diff.mjs']);
  });

  it('skips a URL whose escapes do not decode', () => {
    const child = coverageFile(
      'file:///repo/%E0%A4%A/scripts/gate/lock.mjs',
      'file:///repo/scripts/gate/run.mjs',
    );

    const reached = testedAsProcess(
      [child],
      ['scripts/gate/run.mjs', 'scripts/gate/lock.mjs'],
    );

    expect([...reached]).toEqual(['scripts/gate/run.mjs']);
  });

  it('matches whole path segments only', () => {
    const child = coverageFile('file:///repo/myscripts/gate/run.mjs');

    const reached = testedAsProcess([child], ['scripts/gate/run.mjs']);

    expect([...reached]).toEqual([]);
  });

  it('ignores a process vitest itself ran', () => {
    const worker = coverageFile(VITEST, 'file:///repo/scripts/gate/run.mjs');

    const reached = testedAsProcess([worker], ['scripts/gate/run.mjs']);

    expect([...reached]).toEqual([]);
  });

  it('skips a file that does not parse, as a killed child leaves', () => {
    const killed = '{"result":[{"url":"file:///repo/scripts/gate/lock.mjs"';
    const child = coverageFile('file:///repo/scripts/gate/run.mjs');

    const reached = testedAsProcess(
      [killed, child, '{}'],
      ['scripts/gate/run.mjs', 'scripts/gate/lock.mjs'],
    );

    expect([...reached]).toEqual(['scripts/gate/run.mjs']);
  });

  it('never matches a module under node_modules', () => {
    const child = coverageFile('file:///repo/node_modules/pkg/scripts/gate/run.mjs');

    const reached = testedAsProcess([child], ['scripts/gate/run.mjs']);

    expect([...reached]).toEqual([]);
  });
});

describe('inWorkspace', () => {
  it('keeps the files under a workspace, relative to it', () => {
    const reached = new Set(['scripts/gate/run.mjs', 'apps/e2e/scripts/seed.mjs']);

    const own = inWorkspace(reached, 'apps/e2e');

    expect([...own]).toEqual(['scripts/seed.mjs']);
  });
});
