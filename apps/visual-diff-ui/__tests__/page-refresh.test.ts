import { afterEach, describe, expect, it, vi } from 'vitest';
import { holdPage, requestRefresh, resetPageRefresh } from '../lib/page-refresh';

/**
 * Who owns the page while a mutation is in flight.
 *
 * The console re-reads the server for two unrelated reasons — a row a mutation
 * changed, and a job that just finished — and until this module existed the two
 * decided independently. They overlap in the one window that matters: a reviewer
 * tidies up in the seconds after a compare ends, so the poller's re-read is
 * issued beside a DELETE that has not come back, reads a server that still has
 * the row, and paints back what was just removed. Nothing corrects it, because
 * the poller re-reads once per job id and then backs off.
 *
 * Driven here rather than only through the components, because the ordering is
 * the whole of the fix and a component test can only reach the two orderings its
 * fetches happen to produce. `refresh` is handed in, so every case can say
 * exactly when the page was read and how often.
 */

afterEach(resetPageRefresh);

describe('a page nobody is holding', () => {
  it('is read the moment it is asked for', () => {
    const refresh = vi.fn();

    requestRefresh(refresh);

    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe('a page a mutation is holding', () => {
  it('defers the request rather than reading beside it', () => {
    const release = holdPage();
    const asked = vi.fn();

    requestRefresh(asked);
    expect(asked).not.toHaveBeenCalled();

    // The mutation's own read pays the debt: by now the server has answered it,
    // so this one read carries both the row that changed and the job that ended.
    const mutation = vi.fn();
    release(mutation, true);
    expect(asked).not.toHaveBeenCalled();
    expect(mutation).toHaveBeenCalledTimes(1);
  });

  /** A refused delete changes nothing and so has nothing of its own to re-read
   *  — but it says nothing about the job that finished behind it either, and
   *  that request is still owed. */
  it('keeps a deferred request through a mutation the server refused', () => {
    const release = holdPage();
    requestRefresh(vi.fn());

    const refresh = vi.fn();
    release(refresh, false);

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('reads once for a mutation that changed something and asked for nothing', () => {
    const release = holdPage();
    const refresh = vi.fn();

    release(refresh, true);

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('does not read at all for a refusal nobody was waiting behind', () => {
    const release = holdPage();
    const refresh = vi.fn();

    release(refresh, false);

    expect(refresh).toHaveBeenCalledTimes(0);
  });

  /** The read that matters is the one after the LAST of them: a delete released
   *  while a prune is still running would otherwise read a server mid-prune. */
  it('waits for the last of two overlapping mutations', () => {
    const first = holdPage();
    const second = holdPage();
    const inner = vi.fn();
    const outer = vi.fn();

    first(inner, true);
    expect(inner).not.toHaveBeenCalled();

    second(outer, false);
    expect(outer).toHaveBeenCalledTimes(1);
    expect(inner).not.toHaveBeenCalled();
  });

  it('holds a deferred request across both of them', () => {
    const first = holdPage();
    const second = holdPage();
    requestRefresh(vi.fn());

    first(vi.fn(), false);
    const last = vi.fn();
    second(last, false);

    expect(last).toHaveBeenCalledTimes(1);
  });

  /** The one failure this module must not have. A release counted twice takes
   *  the count below the mutation still holding the page, and every request
   *  after it is read beside a request in flight — silently, and for the life of
   *  the tab. */
  it('counts one release per hold, however many times it is called', () => {
    const first = holdPage();
    const second = holdPage();

    first(vi.fn(), false);
    first(vi.fn(), false);

    const asked = vi.fn();
    requestRefresh(asked);
    expect(asked).not.toHaveBeenCalled();

    second(vi.fn(), false);
    expect(asked).not.toHaveBeenCalled();
  });
});

describe('the page after a reset', () => {
  it('is unheld, whatever was holding it', () => {
    holdPage();
    resetPageRefresh();

    const refresh = vi.fn();
    requestRefresh(refresh);

    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
