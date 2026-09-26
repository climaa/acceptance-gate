// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.ts` include means tsc typechecks this file.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TIMED_OUT, UNREACHABLE, refusalOf, useMutation } from '../hooks/useMutation';
import { NETWORK_TIMEOUT_MS } from '../lib/network';
import { refreshCalls } from './stubs/next-navigation';

/**
 * The one lifecycle every mutation on this console runs.
 *
 * Reached only through `ConfirmDialogs` and `RunPanel` before this, where each
 * caller exercises the path it cares about: a delete that succeeded, a delete the
 * server refused. What no caller's suite reached is the case the hook exists to
 * make uniform — a request that never landed at all — and `refusalOf`'s fallback,
 * for a response carrying no prose.
 *
 * Both matter because they are what a reviewer sees when something is wrong, and
 * "the console said nothing" is the failure this hook was written to prevent.
 */

afterEach(() => {
  cleanup();
  refreshCalls.length = 0;
  vi.unstubAllGlobals();
});

/** The hook, with its state readable from outside a component. */
function harness() {
  const seen: { current: ReturnType<typeof useMutation> | null } = { current: null };

  function Probe() {
    seen.current = useMutation();

    return null;
  }

  render(<Probe />);

  return seen as { current: ReturnType<typeof useMutation> };
}

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

describe('a mutation that landed', () => {
  it('reports ok, hands back the parsed body and re-reads the page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse(200, { removed: 'main-2026-08-17' }))),
    );
    const hook = harness();

    let result;
    await act(async () => {
      result = await hook.current.run({ url: '/api/x', method: 'DELETE', fallback: 'f' });
    });

    expect(result).toEqual({ ok: true, body: { removed: 'main-2026-08-17' } });
    expect(refreshCalls).toHaveLength(1);
    expect(hook.current.refusals).toEqual([]);
  });

  /** A 200 with no body is still a success — `catch(() => ({}))` is why, and a
   *  caller reading a partial refusal out of it gets an empty object. */
  it('survives a success carrying no JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('', { status: 200 }))),
    );
    const hook = harness();

    let result;
    await act(async () => {
      result = await hook.current.run({ url: '/api/x', method: 'POST', fallback: 'f' });
    });

    expect(result).toEqual({ ok: true, body: {} });
  });
});

describe('a mutation the server refused', () => {
  it('renders the server prose verbatim and does not re-read the page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(jsonResponse(409, { error: 'a job is already running' })),
      ),
    );
    const hook = harness();

    await act(async () => {
      await hook.current.run({
        url: '/api/x',
        method: 'POST',
        fallback: 'could not start',
      });
    });

    expect(hook.current.refusals).toEqual(['a job is already running']);
    expect(refreshCalls).toHaveLength(0);
  });

  /** A refusal nobody wrote a sentence for falls back to the action, because
   *  "500" is not something a reviewer can do anything with either. */
  it('names the action when the response carries no prose', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('nope', { status: 500 }))),
    );
    const hook = harness();

    await act(async () => {
      await hook.current.run({
        url: '/api/x',
        method: 'POST',
        fallback: 'could not prune',
      });
    });

    expect(hook.current.refusals).toEqual(['could not prune']);
  });
});

/**
 * The case no caller's suite reached: the request never landed. Not the server's
 * words, because there were none — and saying so beats an empty dialog that looks
 * like it worked.
 */
describe('a mutation that never landed', () => {
  it('says the console could not reach the API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('ECONNREFUSED'))),
    );
    const hook = harness();

    let result;
    await act(async () => {
      result = await hook.current.run({ url: '/api/x', method: 'POST', fallback: 'f' });
    });

    expect(result).toEqual({ ok: false });
    expect(hook.current.refusals).toEqual([UNREACHABLE]);
    expect(refreshCalls).toHaveLength(0);
  });

  it('clears busy whatever happened', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('ECONNREFUSED'))),
    );
    const hook = harness();

    await act(async () => {
      await hook.current.run({ url: '/api/x', method: 'POST', fallback: 'f' });
    });

    expect(hook.current.busy).toBe(false);
  });
});

/** A fetch that neither lands nor fails until its signal gives up — what a
 *  connection that drops packets without closing looks like from the page. */
const stalled = () =>
  vi.fn(
    (_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      }),
  );

/**
 * A request that stalls. It may have reached the server and done its work before
 * the answer was lost, so the refusal says so and the page is read again.
 */
describe('a mutation that ran out of time', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('gives up, says the connection is slow and re-reads the page', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', stalled());
    const hook = harness();

    let result;
    await act(async () => {
      const pending = hook.current.run({
        url: '/api/x',
        method: 'DELETE',
        fallback: 'f',
      });
      await vi.advanceTimersByTimeAsync(NETWORK_TIMEOUT_MS);
      result = await pending;
    });

    expect(result).toEqual({ ok: false });
    expect(hook.current.refusals).toEqual([TIMED_OUT]);
    expect(hook.current.busy).toBe(false);
    expect(refreshCalls).toHaveLength(1);
  });

  it('is still waiting a moment before the limit', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', stalled());
    const hook = harness();

    await act(async () => {
      void hook.current.run({ url: '/api/x', method: 'DELETE', fallback: 'f' });
      await vi.advanceTimersByTimeAsync(NETWORK_TIMEOUT_MS - 1);
    });

    expect(hook.current.busy).toBe(true);
    expect(hook.current.refusals).toEqual([]);
  });
});

describe('the refusals a caller owns', () => {
  it('clears them, and sets the ones read out of a 200', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('down'))),
    );
    const hook = harness();

    await act(async () => {
      await hook.current.run({ url: '/api/x', method: 'POST', fallback: 'f' });
    });
    expect(hook.current.refusals).toHaveLength(1);

    act(() => hook.current.clear());
    expect(hook.current.refusals).toEqual([]);

    // A prune that skipped a held set answered ok and still has something to say.
    act(() => hook.current.refuse(['a is held', 'b is held']));
    expect(hook.current.refusals).toEqual(['a is held', 'b is held']);
  });
});

describe('refusalOf', () => {
  it('reads the error prose off the body', async () => {
    expect(await refusalOf(jsonResponse(409, { error: 'held' }), 'fallback')).toBe(
      'held',
    );
  });

  it.each([
    ['a body that is not JSON', new Response('<html>', { status: 500 })],
    ['a body with no error field', jsonResponse(500, { detail: 'x' })],
    ['an error field that is not a string', jsonResponse(500, { error: 42 })],
  ])('falls back on %s', async (_case, response) => {
    expect(await refusalOf(response, 'could not delete')).toBe('could not delete');
  });
});
