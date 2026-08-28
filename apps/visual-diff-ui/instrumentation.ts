import { installBugsink } from '@gate/logger/bugsink';

/**
 * Server realm. Next calls this once per runtime before anything else runs,
 * which is the only place a reporter can be installed early enough to catch the
 * first request.
 *
 * `instrumentation-client.ts` is the browser's copy of this, and it has to
 * exist separately: `setReporter` writes to a `globalThis` slot, which unifies
 * Next's several server-side module graphs but cannot cross into the browser.
 *
 * `dsn` is a defaulted parameter rather than an inline read so the suite can
 * name it — the same reason `createLogger` takes its mode that way. Next calls
 * `register()` with no arguments.
 */
export const register = async (dsn = process.env.BUGSINK_DSN): Promise<void> => {
  // `@sentry/node` opens sockets and starts OpenTelemetry; the edge runtime has
  // neither. Nothing here needs an edge reporter today — `proxy.ts` is the only
  // code that could want one — so the branch declines rather than substituting
  // the browser SDK, which would report from a server as if from a reader.
  if (process.env.NEXT_RUNTIME === 'edge') return;

  await installBugsink({
    dsn,
    load: () => import('@sentry/node'),
    // Which deployment produced the event. Server-side only: the browser half
    // has no unprefixed env to read, and its own gate is the public DSN, which
    // is set on the production environment and nowhere else.
    environment: process.env.VERCEL_ENV,
  });
};
