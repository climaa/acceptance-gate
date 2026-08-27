export type LogFn = (...data: unknown[]) => void;
// Positional unknown[] is deliberate: this is a console-shaped logger. The future
// Bugsink adapter recovers the Error from the args (wrapping plain strings in
// new Error() — captureMessage loses the stack); warn/info never reach the reporter.
export type Reporter = (...data: unknown[]) => void;
export interface Logger {
  error: LogFn;
  warn: LogFn;
  info: LogFn;
}

const noop: Reporter = () => {};

export const createLogger = (
  report: Reporter = noop,
  mode = process.env.NODE_ENV, // defaulted param = testable
): Logger => {
  const silent = mode === 'production';
  return {
    error: (...data) => {
      report(...data);
      if (!silent) console.error(...data);
    },
    warn: (...data) => {
      if (!silent) console.warn(...data);
    },
    info: (...data) => {
      if (!silent) console.info(...data);
    },
  };
};

// globalThis-backed so one setReporter() reaches every module instance in the same
// realm (Next gives the RSC and SSR layers separate copies of this module).
const REPORTER_KEY = Symbol.for('@gate/logger.reporter');
type ReporterSlot = { [key: symbol]: Reporter | undefined };

export const setReporter = (next: Reporter): void => {
  (globalThis as ReporterSlot)[REPORTER_KEY] = next;
};

export const logger: Logger = createLogger((...data) =>
  ((globalThis as ReporterSlot)[REPORTER_KEY] ?? noop)(...data),
);
