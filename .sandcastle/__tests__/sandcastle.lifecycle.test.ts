import { sandcastleImageName, withRetry } from '../sandcastle-lifecycle.mts';

/**
 * REAL unit tests. sandcastle-lifecycle.mts imports nothing from this directory
 * (only node:child_process), so both helpers below are directly loadable —
 * `sandcastle.lifecycle-prune-retry.test.ts` only ever regex-asserted their
 * source text, never executed them. These exercise the two pure/near-pure ones.
 */

describe('sandcastleImageName', () => {
  it('derives sandcastle:<basename> from a repo path', () => {
    // Arrange & Act & Assert — mirrors the docker() factory's default tag.
    expect(sandcastleImageName('/Users/dev/acceptance-gate')).toBe(
      'sandcastle:acceptance-gate',
    );
  });

  it('ignores a trailing slash', () => {
    // Arrange & Act & Assert
    expect(sandcastleImageName('/Users/dev/acceptance-gate/')).toBe(
      'sandcastle:acceptance-gate',
    );
  });

  it('lowercases and replaces characters outside [a-z0-9_.-] with a dash', () => {
    // Arrange & Act & Assert — the sanitize rule the reap filter depends on.
    expect(sandcastleImageName('/tmp/My_Repo.2')).toBe('sandcastle:my_repo.2');
    expect(sandcastleImageName('/tmp/re@po!')).toBe('sandcastle:re-po-');
  });

  it('falls back to sandcastle:local when the basename is empty', () => {
    // Arrange & Act & Assert — e.g. the filesystem root, where a wrong tag would
    // make the reap filter match nothing.
    expect(sandcastleImageName('/')).toBe('sandcastle:local');
  });
});

describe('withRetry', () => {
  it('returns the value and calls fn once when it succeeds first try', async () => {
    // Arrange
    let calls = 0;
    const fn = async () => {
      calls++;
      return 'ok';
    };

    // Act
    const result = await withRetry(fn, 3, 0);

    // Assert
    expect(result).toBe('ok');
    expect(calls).toBe(1);
  });

  it('retries and succeeds after transient failures', async () => {
    // Arrange — fail twice, then succeed (delayMs 0 keeps the test fast).
    let calls = 0;
    const fn = async () => {
      calls++;
      if (calls < 3) throw new Error('transient');
      return 'recovered';
    };

    // Act
    const result = await withRetry(fn, 3, 0);

    // Assert
    expect(result).toBe('recovered');
    expect(calls).toBe(3);
  });

  it('exhausts the attempts and throws the LAST error', async () => {
    // Arrange — each attempt fails with a distinct message.
    let calls = 0;
    const fn = async () => {
      calls++;
      throw new Error(`fail-${calls}`);
    };

    // Act & Assert
    await expect(withRetry(fn, 3, 0)).rejects.toThrow('fail-3');
    expect(calls).toBe(3);
  });

  it('escalates the backoff linearly (delayMs, 2*delayMs, …)', async () => {
    // Arrange
    vi.useFakeTimers();
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const fn = async () => {
      throw new Error('always');
    };

    // Act — drive the retry loop's awaited timers to completion.
    const settled = withRetry(fn, 3, 100).catch((e) => e);
    await vi.runAllTimersAsync();
    await settled;

    // Assert — attempt 1 waits 100, attempt 2 waits 200; the final attempt does
    // not wait.
    const delays = setTimeoutSpy.mock.calls.map((c) => c[1]);
    expect(delays).toEqual([100, 200]);

    // Cleanup
    vi.useRealTimers();
  });
});
