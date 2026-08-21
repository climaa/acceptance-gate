import { HOST } from '@gate/visual-diff/policy';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.ts` include means tsc typechecks this file.
import { describe, expect, it } from 'vitest';
import {
  ACCEPT_COMMAND,
  ACCEPT_IMAGE,
  acceptGate,
  reviewableCount,
} from '../lib/accept-gate';
import type { Bucket } from '../lib/summary';

/**
 * The accept gate's decision, without a screen.
 *
 * The CLI has no host guard on `accept` — this is the guard it lacks (D3), so
 * the order the four answers come in is the contract: an accessibility failure
 * outranks everything, the review is asked before the host, and only a report
 * that cleared all three is acceptable. The panel renders the answer; what the
 * answer IS lives here, where it can be asked without a DOM.
 */

const CLEAN: Record<Bucket, number> = {
  unchanged: 100,
  changed: 6,
  added: 0,
  removed: 0,
  errored: 0,
  a11y: 0,
};

/** Everything reviewed, the pinned container, no accessibility failure. */
const READY = { counts: CLEAN, reviewed: 6 };

describe('reviewableCount', () => {
  // `unchanged` variants never reach `summary.variants` — the differ drops them
  // — so they are not variants a reviewer is ever shown, and counting them would
  // hold accept closed against 100 cards nobody can open.
  it('counts every bucket but unchanged', () => {
    const count = reviewableCount({ ...CLEAN, changed: 6, added: 2, removed: 1 });

    expect(count).toBe(9);
  });

  it('is zero for a run where nothing moved', () => {
    const count = reviewableCount({ ...CLEAN, changed: 0 });

    expect(count).toBe(0);
  });
});

describe('acceptGate', () => {
  it('refuses a report carrying an accessibility failure', () => {
    const gate = acceptGate({ ...READY, counts: { ...CLEAN, a11y: 2 } });

    expect(gate).toEqual({ state: 'accessibility', failures: 2 });
  });

  // Both wrong at once: the accessibility answer is the one that has to come
  // back, because a review that finished would not make the violation
  // acceptable — reviewing never clears one, fixing does.
  it('reports the accessibility failure ahead of the reading it would need', () => {
    const gate = acceptGate({ counts: { ...CLEAN, a11y: 1 }, reviewed: 0 });

    expect(gate).toEqual({ state: 'accessibility', failures: 1 });
  });

  /**
   * The host is not this module's question any more, and this is the case that
   * says so out loud.
   *
   * It used to be a fourth answer and a refusal: off the pinned image accept had
   * no button, because a promote stamps the machine that wrote it. The console
   * now runs the pinned container itself, so the host decides HOW the job runs
   * rather than whether there is one — and `containerState` in the run panel
   * answers that for accept the same way it does for capture.
   */
  it('opens a read-through report without asking what host it is on', () => {
    const gate = acceptGate(READY);

    expect(gate).toEqual({ state: 'ready' });
  });

  it('holds accept closed while variants remain unreviewed', () => {
    const gate = acceptGate({ ...READY, reviewed: 4 });

    expect(gate).toEqual({ state: 'unreviewed', reviewed: 4, total: 6 });
  });

  it('opens accept once the report has been read through', () => {
    const gate = acceptGate(READY);

    expect(gate).toEqual({ state: 'ready' });
  });

  // Marks are keyed by variant, and a report re-run under the same id can drop
  // one: the reader has still seen everything this report shows, so the count
  // that survives is the one that decides.
  it('opens accept when more marks are stored than the report has variants', () => {
    const gate = acceptGate({ ...READY, reviewed: 9 });

    expect(gate).toEqual({ state: 'ready' });
  });
});

describe('the container command', () => {
  // Not a restatement of the constant: the gate above compares against this
  // value and the block below tells a reviewer to run it, so the two have to be
  // the image `policy.HOST` pins rather than a string this app decided.
  it('is the image policy pins', () => {
    expect(ACCEPT_IMAGE).toBe(HOST.image);
  });

  it('runs that image', () => {
    expect(ACCEPT_COMMAND).toContain(ACCEPT_IMAGE);
  });

  // The degraded path is the CLI's own accept, run inside the container — the
  // command a reviewer copies has to be the one packages/visual-diff documents.
  it('runs the CLI accept from the repo root', () => {
    expect(ACCEPT_COMMAND).toContain('node packages/visual-diff/src/cli.mjs accept');
  });

  // The two flags a reviewer would never guess: the browser baked into the
  // image, and Docker's 64MB /dev/shm.
  it('carries the flags the recipe depends on', () => {
    expect(ACCEPT_COMMAND).toContain('--ipc=host');
    expect(ACCEPT_COMMAND).toContain('PLAYWRIGHT_BROWSERS_PATH=/ms-playwright');
    expect(ACCEPT_COMMAND).toContain('-v "$(pwd)":/repo -w /repo');
  });
});
