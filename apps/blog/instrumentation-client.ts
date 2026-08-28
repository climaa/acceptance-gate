import { installBugsink } from '@gate/logger/bugsink';

/**
 * Browser realm — see `instrumentation.ts` for why this is a second file.
 *
 * The DSN is read as a bare literal here, not through the defaulted parameter
 * this repo reaches for everywhere else, and that is half the point — Next only
 * inlines a `NEXT_PUBLIC_*` read it can see in the app's own source. The other
 * half is next.config's `env` block, which normalises an unset variable to '':
 * without it the read stays a live `process.env` lookup and nothing can be
 * eliminated. Together they compile this guard to `if ('')`, and the bundler
 * drops the branch — and with it the 438 KB `@sentry/browser` chunk behind the
 * dynamic import. Behind a
 * function parameter the import stays reachable from an export, which is
 * measurably worse than it sounds: Turbopack chunks the SDK together with this
 * module, so every reader would download the whole SDK on every page to run a
 * branch that was never going to initialise it.
 *
 * A Sentry-style DSN is submit-only, so it is safe in a public bundle; abuse
 * control is Bugsink's per-project rate limiting.
 *
 * `environment` is server-only: the browser has no unprefixed env to read, and
 * this half's gate is the public DSN, which is set on production and nowhere
 * else.
 */
if (process.env.NEXT_PUBLIC_BUGSINK_DSN) {
  void installBugsink({
    dsn: process.env.NEXT_PUBLIC_BUGSINK_DSN,
    load: () => import('@sentry/browser'),
  });
}
