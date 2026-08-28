import { afterEach, describe, expect, it, vi } from 'vitest';

import { createLogger, logger, type Reporter } from './index';
import { createBugsinkReporter, installBugsink, toReport, type Tracker } from './bugsink';

/**
 * The half of the Bugsink wiring that runs everywhere. The SDK itself is an
 * injected `load()` thunk, so nothing here reaches a network, a DSN or
 * `@sentry/*` — the apps name those, this file pins what the adapter does with
 * them.
 */

const REPORTER_KEY = Symbol.for('@gate/logger.reporter');

/** The three calls the adapter makes, recorded rather than performed. */
const fakeTracker = (overrides: Partial<Tracker> = {}) => ({
  init: vi.fn(),
  captureException: vi.fn(),
  flush: vi.fn(() => Promise.resolve(true)),
  ...overrides,
});

const DSN = 'https://key@bugsink.example.com/1';

afterEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as { [key: symbol]: Reporter | undefined })[REPORTER_KEY];
});

describe('toReport', () => {
  // The whole reason logger.error takes positional args: the Error is in there
  // somewhere, and it is the only argument carrying a stack.
  it('passes a forwarded Error through, keeping the rest as context', () => {
    const failure = new Error('boom');

    const report = toReport(['capture set missing', failure, { setId: 'home' }]);

    expect(report.error).toBe(failure);
    expect(report.extra).toEqual(['capture set missing', { setId: 'home' }]);
  });

  // captureMessage would lose the stack, so a string is wrapped instead.
  it('wraps a plain-string report in an Error', () => {
    const report = toReport(['nothing to compare']);

    expect(report.error).toBeInstanceOf(Error);
    expect(report.error.message).toBe('nothing to compare');
    expect(report.extra).toEqual([]);
  });

  it('takes the first Error when several are forwarded', () => {
    const first = new Error('first');
    const second = new Error('second');

    const report = toReport([first, second]);

    expect(report.error).toBe(first);
    expect(report.extra).toEqual([second]);
  });

  it('reads a message off a non-string, non-Error first argument', () => {
    const report = toReport([{ code: 'ENOENT' }, 'trailing']);

    expect(report.error.message).toBe('{"code":"ENOENT"}');
    expect(report.extra).toEqual(['trailing']);
  });

  it('still produces an Error when nothing was forwarded at all', () => {
    const report = toReport([]);

    expect(report.error).toBeInstanceOf(Error);
    expect(report.error.message).toMatch(/no arguments/);
  });
});

describe('createBugsinkReporter', () => {
  it('captures the recovered Error with the remaining arguments as context', () => {
    const tracker = fakeTracker();
    const failure = new Error('boom');

    createBugsinkReporter(tracker)('while promoting', failure);

    expect(tracker.captureException).toHaveBeenCalledWith(failure, {
      extra: { arguments: ['while promoting'] },
    });
  });

  // Serverless freezes the moment the response is written, and the reporter is
  // synchronous, so the send is started rather than awaited.
  it('starts a flush after capturing', () => {
    const tracker = fakeTracker();

    createBugsinkReporter(tracker)(new Error('boom'));

    expect(tracker.flush).toHaveBeenCalledTimes(1);
  });

  // A reporter that throws turns a logged error into an unhandled one.
  it('does not throw when the tracker does', () => {
    const tracker = fakeTracker({
      captureException: vi.fn(() => {
        throw new Error('transport down');
      }),
    });

    expect(() => createBugsinkReporter(tracker)('boom')).not.toThrow();
  });

  it('does not throw, or leave a rejection unhandled, when the flush fails', () => {
    const tracker = fakeTracker({ flush: vi.fn(() => Promise.reject(new Error('no'))) });

    expect(() => createBugsinkReporter(tracker)('boom')).not.toThrow();
  });
});

describe('installBugsink', () => {
  // The case every local run, every CI job and every sandbox takes.
  it('loads no SDK and installs no reporter when the DSN is unset', async () => {
    const load = vi.fn();
    const install = vi.fn();

    const installed = await installBugsink({ dsn: undefined, load, install });

    expect(installed).toBe(false);
    expect(load).not.toHaveBeenCalled();
    expect(install).not.toHaveBeenCalled();
  });

  it('treats a blank DSN as no DSN', async () => {
    const load = vi.fn();

    const installed = await installBugsink({ dsn: '   ', load, install: vi.fn() });

    expect(installed).toBe(false);
    expect(load).not.toHaveBeenCalled();
  });

  // Bugsink does not support traces, and this adds no replay or profiling.
  it('initialises the SDK with the DSN and no tracing', async () => {
    const tracker = fakeTracker();

    const installed = await installBugsink({
      dsn: DSN,
      load: () => Promise.resolve(tracker),
      environment: 'production',
      install: vi.fn(),
    });

    expect(installed).toBe(true);
    expect(tracker.init).toHaveBeenCalledWith({
      dsn: DSN,
      tracesSampleRate: 0,
      environment: 'production',
    });
  });

  it('installs into the real reporter slot, so logger.error reaches the tracker', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const tracker = fakeTracker();
    await installBugsink({ dsn: DSN, load: () => Promise.resolve(tracker) });

    logger.error('boom');

    expect(tracker.captureException).toHaveBeenCalledTimes(1);
  });

  it('reports rather than throws when the SDK cannot be loaded', async () => {
    const printed = vi.spyOn(console, 'error').mockImplementation(() => {});
    const install = vi.fn();

    const installed = await installBugsink({
      dsn: DSN,
      load: () => Promise.reject(new Error('module not found')),
      install,
    });

    expect(installed).toBe(false);
    expect(install).not.toHaveBeenCalled();
    expect(printed).toHaveBeenCalledWith(
      'bugsink reporter not installed',
      expect.any(Error),
    );
  });
});

describe('the adapter under a development logger', () => {
  // The reporter runs before the console does; neither may stand in for the other.
  it('prints exactly once and captures exactly once', () => {
    const printed = vi.spyOn(console, 'error').mockImplementation(() => {});
    const tracker = fakeTracker();
    const log = createLogger(createBugsinkReporter(tracker), 'development');

    log.error('boom');

    expect(printed).toHaveBeenCalledTimes(1);
    expect(tracker.captureException).toHaveBeenCalledTimes(1);
  });
});
