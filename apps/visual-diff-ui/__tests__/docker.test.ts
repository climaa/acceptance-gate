// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.ts` include means tsc typechecks this file.
import { HOST } from '@gate/visual-diff/policy';
import { describe, expect, it } from 'vitest';
import { DATA_MOUNT, REPO_MOUNT, containerArgv, dockerAvailable } from '../lib/docker';

/**
 * The container this console starts on a reviewer's behalf.
 *
 * The argv is the whole contract: it is a transcription of the recipe
 * `packages/visual-diff/README.md` documents, and the three flags that make it
 * work are the ones nobody would guess. A case per flag, because a capture that
 * silently loses one of them fails minutes later inside Chromium.
 */

const argv = containerArgv('/repo path', '/data path', ['node', 'thing.mjs']);

describe('containerArgv', () => {
  it('runs the image policy pins', () => {
    expect(argv).toContain(HOST.image);
  });

  // The browser baked into the image, not the host's Playwright cache — which
  // inside the container is either absent or the wrong OS's build.
  it('points playwright at the image browsers', () => {
    expect(argv).toContain('PLAYWRIGHT_BROWSERS_PATH=/ms-playwright');
  });

  // Chromium against Docker's default 64MB /dev/shm crashes partway through a
  // corpus, which reads as a flaky capture rather than as a missing flag.
  it('gives chromium the host ipc namespace', () => {
    expect(argv).toContain('--ipc=host');
  });

  it('removes the container when it is done', () => {
    expect(argv).toContain('--rm');
  });

  // Two mounts. The data directory is addressed on its own because
  // `VISUAL_DIFF_DATA_DIR` may point anywhere, and a path that only works when
  // it happens to sit inside the checkout is a trap that springs the first time
  // it does not.
  it('mounts the checkout and the data directory separately', () => {
    expect(argv).toContain(`/repo path:${REPO_MOUNT}`);
    expect(argv).toContain(`/data path:${DATA_MOUNT}`);
  });

  // An array, never a string. A repo path with a space in it is an argument
  // here; through a shell it would be two.
  it('keeps a path with a space in it as one argument', () => {
    expect(argv).toContain('/repo path:/repo');
  });

  it('ends with the command it was asked to run', () => {
    expect(argv.slice(-2)).toEqual(['node', 'thing.mjs']);
  });

  it('works from the repo mount', () => {
    expect(argv[argv.indexOf('-w') + 1]).toBe(REPO_MOUNT);
  });
});

describe('dockerAvailable', () => {
  // Whatever this machine answers, it answers definitely: the panel disables a
  // button on it, and `undefined` there would be a control in a third state
  // nothing renders. The value itself is the machine's, not this suite's.
  it('answers with a boolean, on any machine', () => {
    expect(typeof dockerAvailable()).toBe('boolean');
  });
});
