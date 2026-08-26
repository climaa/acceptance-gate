import { afterEach, describe, expect, it, vi } from 'vitest';
import { holdPage, requestRefresh, resetPageRefresh } from '../lib/page-refresh';

/**
 * Who owns the page while a mutation is in flight.
 *
 * The race this answers — a poller's re-read issued beside a DELETE that has not
 * come back, painting back the row a reviewer just removed — is argued in
 * `lib/page-refresh.ts` and not retold here.
 *
 * Driven at this layer rather than only through the components, because the
 * ordering is the whole of the fix and a component test can only reach the two
 * orderings its fetches happen to produce. `refresh` is handed in, so every case
 * can say exactly when the page was read and how often.
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
    holdPage();
    const asked = vi.fn();

    requestRefresh(asked);

    expect(asked).not.toHaveBeenCalled();
  });

  it("pays a deferred request with the mutation's own read", () => {
    const release = holdPage();
    const asked = vi.fn();
    const mutation = vi.fn();
    requestRefresh(asked);

    release(mutation, true);

    // By now the server has answered the mutation, so this one read carries both
    // the row that changed and the job that ended.
    expect(mutation).toHaveBeenCalledTimes(1);
    expect(asked).not.toHaveBeenCalled();
  });

  /** A refused delete changes nothing and so has nothing of its own to re-read
   *  — but it says nothing about the job that finished behind it either, and
   *  that request is still owed. */
  it('keeps a deferred request through a mutation the server refused', () => {
    const release = holdPage();
    const refresh = vi.fn();
    requestRefresh(vi.fn());

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
  it('does not read while a second mutation is still holding', () => {
    const first = holdPage();
    holdPage();
    const inner = vi.fn();

    first(inner, true);

    expect(inner).not.toHaveBeenCalled();
  });

  it('reads when the last of two overlapping mutations releases', () => {
    const first = holdPage();
    const second = holdPage();
    const inner = vi.fn();
    const outer = vi.fn();
    first(inner, true);

    second(outer, false);

    // The debt was the first mutation's, and the last release is what pays it.
    expect(outer).toHaveBeenCalledTimes(1);
    expect(inner).not.toHaveBeenCalled();
  });

  it('holds a deferred request across both of them', () => {
    const first = holdPage();
    const second = holdPage();
    const last = vi.fn();
    requestRefresh(vi.fn());
    first(vi.fn(), false);

    second(last, false);

    expect(last).toHaveBeenCalledTimes(1);
  });

  /** The one failure this module must not have. A release counted twice takes
   *  the count below the mutation still holding the page, and every request
   *  after it is read beside a request in flight — silently, and for the life of
   *  the tab. */
  it('counts one release per hold, however many times it is called', () => {
    const first = holdPage();
    holdPage();
    const asked = vi.fn();
    first(vi.fn(), false);
    first(vi.fn(), false);

    requestRefresh(asked);

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
