import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.ts` include means tsc typechecks this file.
import { afterAll, describe, expect, it } from 'vitest';
import { describeCheckout, repoRoot } from '../lib/git';

/**
 * Which checkout the console is running inside, and what git says about it.
 *
 * Both answers are provenance a capture set records, so both are held here
 * rather than inside the runner's suite: this is the only file in the app that
 * depends on there being a real repository around it, and on `git` being on
 * PATH.
 */

const REPO_ROOT = path.resolve(process.cwd(), '..', '..');

const temporaryDirs: string[] = [];

function outsideAnyCheckout(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-git-'));
  temporaryDirs.push(dir);

  return dir;
}

afterAll(() => {
  for (const dir of temporaryDirs) fs.rmSync(dir, { recursive: true, force: true });
});

describe('repoRoot', () => {
  // The value `runCheck` hands the differ as `rootDir`: get it wrong and `check`
  // reports a missing Storybook build for a build that is right there.
  it('finds the checkout from inside a workspace', () => {
    expect(repoRoot(process.cwd())).toBe(REPO_ROOT);
  });

  it('finds it from a directory nested well below one', () => {
    expect(repoRoot(path.join(process.cwd(), 'lib'))).toBe(REPO_ROOT);
  });

  // Null rather than the filesystem root. A console started from outside a
  // checkout has nothing to capture, and `runCheck` says so instead of pointing
  // the differ at `/`.
  it('answers with nothing outside every checkout', () => {
    expect(repoRoot(outsideAnyCheckout())).toBeNull();
  });

  /**
   * The walk is an `existsSync` per level of the path, and the dashboard reaches
   * it on every render through `readCanonicalSet`, so the answer for the working
   * directory is memoised.
   *
   * What is asserted here is that the memo is KEYED — the cheap version of it
   * was set once and would go on answering with the checkout of a directory
   * nobody is in any more. There is no way to observe the saved `existsSync`
   * calls directly: this suite mocks nothing, and an ESM namespace cannot be
   * spied on anyway. Moving the process is the observable consequence.
   */
  it('re-walks when the working directory moves', () => {
    const original = process.cwd();
    const outside = outsideAnyCheckout();

    try {
      expect(repoRoot()).toBe(REPO_ROOT);

      process.chdir(outside);
      expect(repoRoot()).toBeNull();

      process.chdir(original);
      expect(repoRoot()).toBe(REPO_ROOT);
    } finally {
      process.chdir(original);
    }
  });

  // The memo is deliberately only for the default. An explicit `from` is a
  // caller probing a directory it may still be building — the case below writes
  // its marker after asking once — and a cached answer there would report a
  // checkout that did not exist yet.
  it('does not memoise a directory it was handed', () => {
    const dir = outsideAnyCheckout();
    expect(repoRoot(dir)).toBeNull();

    fs.writeFileSync(path.join(dir, 'pnpm-workspace.yaml'), 'packages: []\n');

    expect(repoRoot(dir)).toBe(path.resolve(dir));
  });
});

describe('describeCheckout', () => {
  it('reads the commit this suite is running at', () => {
    const checkout = describeCheckout(REPO_ROOT);

    expect(checkout?.sha).toMatch(/^[0-9a-f]{40}$/);
    expect(checkout?.branch).not.toBe('');
    expect(typeof checkout?.dirty).toBe('boolean');
  });

  // A guess here would be a provenance claim about a set nobody could
  // reproduce, so the set records "unknown" instead — see lib/runner.ts.
  it('answers with nothing where there is no repository', () => {
    expect(describeCheckout(outsideAnyCheckout())).toBeNull();
  });
});
