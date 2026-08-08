import { raceWithTimeout } from '../sandcastle-build-verify.mts';

/**
 * REAL unit tests for the build-verify timeout race.
 *
 * The bug: runBuildVerify used `Promise.race([exec, setTimeout(reject, 600s)])`
 * and never cleared the timer. When the build won (the common case) the pending
 * 10-minute timer kept the event loop alive, so the orchestrator hung after
 * "All done." until the last timer fired. These tests pin the fix: the timer is
 * cleared on EVERY settlement path, asserted via vi.getTimerCount().
 */
describe('raceWithTimeout', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves with the work value and leaves no pending timer', async () => {
    // Arrange
    vi.useFakeTimers();

    // Act
    const result = await raceWithTimeout(Promise.resolve('built'), 600_000, 'timed out');

    // Assert — the value passes through, and the timeout timer is gone (the bug
    // left it running for the full 600s here).
    expect(result).toBe('built');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears the timer when work rejects before the timeout', async () => {
    // Arrange
    vi.useFakeTimers();

    // Act & Assert — the work rejection propagates unchanged...
    await expect(
      raceWithTimeout(Promise.reject(new Error('build failed')), 600_000, 'timed out'),
    ).rejects.toThrow('build failed');

    // ...and no timer survives.
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects with the timeout message when work never settles, then clears', async () => {
    // Arrange — work that never resolves, so the timeout must win.
    vi.useFakeTimers();
    const never = new Promise<string>(() => {});
    const raced = raceWithTimeout(never, 600_000, 'pnpm build exceeded 600000ms');
    // Attach the rejection expectation BEFORE advancing timers: otherwise `raced`
    // rejects mid-advance with no handler yet, a transient unhandled rejection.
    const assertion = expect(raced).rejects.toThrow('pnpm build exceeded 600000ms');

    // Act — advance past the deadline.
    await vi.advanceTimersByTimeAsync(600_000);

    // Assert
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });
});
