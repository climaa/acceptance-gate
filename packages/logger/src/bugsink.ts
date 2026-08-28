import { logger, setReporter, type Reporter } from './index';

/**
 * The Bugsink adapter: the thing `logger.error()` forwards to once a DSN
 * exists, and nothing at all until then.
 *
 * Bugsink is Sentry-compatible and ships no SDK of its own, so the transport is
 * a Sentry SDK pointed at a Bugsink DSN. Which one is the caller's business:
 * this module never imports `@sentry/*`, it takes a `load()` thunk. That is
 * what lets one file serve both realms — `@sentry/node` in `instrumentation.ts`
 * and `@sentry/browser` in `instrumentation-client.ts` — and what keeps
 * `@gate/logger` itself dependency-free, so `proxy.ts` and every Server
 * Component can keep importing it.
 *
 * With no DSN the thunk is never called: no SDK evaluates, no reporter is
 * installed, and `logger.error` keeps hitting the no-op it hits today.
 */

/**
 * The slice of a Sentry SDK this adapter uses. Declared with method syntax on
 * purpose: TypeScript checks method parameters bivariantly, so the real
 * `@sentry/node` / `@sentry/browser` namespaces satisfy it without a cast at
 * the call site, and this file stays honest about the three calls it makes.
 */
export interface Tracker {
  init(options: TrackerOptions): unknown;
  captureException(error: Error, hint?: { extra: Record<string, unknown> }): unknown;
  flush?(timeout?: number): PromiseLike<unknown>;
}

export interface TrackerOptions {
  readonly dsn: string;
  /** Always 0 — Bugsink deliberately does not accept traces. */
  readonly tracesSampleRate: 0;
  readonly environment?: string | undefined;
}

/** What a forwarded argument list becomes: one Error, plus everything else. */
export interface Report {
  readonly error: Error;
  readonly extra: readonly unknown[];
}

/**
 * How long a capture gets to reach Bugsink. The reporter is synchronous, so a
 * serverless host may freeze the process the moment the response is written —
 * the flush cannot be awaited, only started early enough to usually finish.
 */
const FLUSH_TIMEOUT_MS = 2_000;

const NO_ARGUMENTS = 'logger.error() called with no arguments';

const isError = (value: unknown): value is Error => value instanceof Error;

/** A message for something that was never an Error, without throwing on a cycle. */
const messageOf = (value: unknown): string => {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
};

/**
 * Recover the Error from a console-shaped argument list.
 *
 * Both halves are the Bugsink author's own guidance. An `Error` among the
 * arguments is captured as-is, because it is the only one carrying a stack; a
 * report that is only a string is wrapped in `new Error(message)` rather than
 * sent through `captureMessage`, which files it with no stack at all.
 */
export const toReport = (data: readonly unknown[]): Report => {
  const failure = data.find(isError);
  if (failure) return { error: failure, extra: data.filter((item) => item !== failure) };

  if (data.length === 0) return { error: new Error(NO_ARGUMENTS), extra: [] };

  const [first, ...rest] = data;
  return { error: new Error(messageOf(first)), extra: rest };
};

/**
 * A `Reporter` over a tracker. It swallows everything: a reporter that throws
 * turns a logged error into an unhandled one at the call site that was trying
 * to be careful.
 */
export const createBugsinkReporter =
  (tracker: Tracker): Reporter =>
  (...data) => {
    const { error, extra } = toReport(data);
    try {
      tracker.captureException(
        error,
        extra.length > 0 ? { extra: { arguments: extra } } : undefined,
      );
      // Swallowed rather than left dangling: an unhandled rejection from a
      // tracker that cannot be reached is the same crash this catch prevents.
      tracker.flush?.(FLUSH_TIMEOUT_MS)?.then(undefined, () => {});
    } catch {
      // Nothing to report the failure to — this IS the reporter.
    }
  };

export interface BugsinkOptions {
  /**
   * `BUGSINK_DSN` on the server, `NEXT_PUBLIC_BUGSINK_DSN` in the browser —
   * named by the caller rather than read here, because Next only inlines a
   * `NEXT_PUBLIC_*` read it can see in the app's own source. Unset is the
   * normal case and the whole point.
   */
  readonly dsn: string | undefined;
  /** `() => import('@sentry/node')` or `() => import('@sentry/browser')`. */
  readonly load: () => Promise<Tracker>;
  /** Which deployment the event came from; `VERCEL_ENV` on Vercel. */
  readonly environment?: string | undefined;
  /** Injected so this package's own suite can watch the wiring. */
  readonly install?: (reporter: Reporter) => void;
}

/**
 * Point `logger.error` at Bugsink, if there is a Bugsink to point it at.
 * Returns whether it installed anything.
 */
export const installBugsink = async ({
  dsn,
  load,
  environment,
  install = setReporter,
}: BugsinkOptions): Promise<boolean> => {
  if (!dsn?.trim()) return false;

  try {
    const tracker = await load();
    tracker.init({ dsn, tracesSampleRate: 0, environment });
    install(createBugsinkReporter(tracker));
    return true;
  } catch (cause) {
    // Through the logger rather than the console: an app that cannot reach its
    // error tracker must still boot, and this is exactly the kind of failure
    // the tracker would have been told about had it been reachable.
    logger.error('bugsink reporter not installed', cause);
    return false;
  }
};
