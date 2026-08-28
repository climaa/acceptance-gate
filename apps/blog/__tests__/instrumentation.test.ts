// Imported explicitly rather than relying on `globals: true` — same reason as
// content.test.ts: tsconfig's `**/*.ts` include means tsc typechecks this file.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Reporter } from '@gate/logger';

/**
 * Where `logger.error` goes. Both realms wire the same adapter, and both are
 * gated on a DSN that no local run, no CI job and no sandbox sets — so the case
 * that matters most here is the empty one: nothing loaded, nothing installed,
 * nothing changed.
 *
 * The SDKs are mocked. This suite is about which branch the wiring took, not
 * about Sentry's transport, and a real `@sentry/node` would start OpenTelemetry
 * inside a unit test.
 */

const sdk = () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  flush: vi.fn(() => Promise.resolve(true)),
});

const { nodeSdk, browserSdk } = vi.hoisted(() => ({
  nodeSdk: { init: vi.fn(), captureException: vi.fn(), flush: vi.fn() },
  browserSdk: { init: vi.fn(), captureException: vi.fn(), flush: vi.fn() },
}));

vi.mock('@sentry/node', () => nodeSdk);
vi.mock('@sentry/browser', () => browserSdk);

const REPORTER_KEY = Symbol.for('@gate/logger.reporter');
const installedReporter = () =>
  (globalThis as { [key: symbol]: Reporter | undefined })[REPORTER_KEY];

const DSN = 'https://key@bugsink.example.com/1';

beforeEach(() => {
  Object.assign(nodeSdk, sdk());
  Object.assign(browserSdk, sdk());
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  delete (globalThis as { [key: symbol]: Reporter | undefined })[REPORTER_KEY];
});

describe('the server realm', () => {
  // The configuration every check in this repo runs under.
  it('initialises nothing when no DSN is set', async () => {
    const { register } = await import('../instrumentation');

    await register(undefined);

    expect(nodeSdk.init).not.toHaveBeenCalled();
    expect(installedReporter()).toBeUndefined();
  });

  it('points the Node SDK at the DSN, with tracing off', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    const { register } = await import('../instrumentation');

    await register(DSN);

    expect(nodeSdk.init).toHaveBeenCalledWith({
      dsn: DSN,
      tracesSampleRate: 0,
      environment: 'production',
    });
    expect(installedReporter()).toBeInstanceOf(Function);
  });

  // `register()` runs once per runtime, and @sentry/node is a Node SDK.
  it('stays out of the edge runtime even with a DSN', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'edge');
    const { register } = await import('../instrumentation');

    await register(DSN);

    expect(nodeSdk.init).not.toHaveBeenCalled();
    expect(installedReporter()).toBeUndefined();
  });
});

describe('the browser realm', () => {
  // Separate file because the globalThis slot cannot cross the realm boundary.
  it('initialises nothing when no DSN is set', async () => {
    vi.stubEnv('NEXT_PUBLIC_BUGSINK_DSN', undefined);

    await import('../instrumentation-client');

    expect(browserSdk.init).not.toHaveBeenCalled();
    expect(installedReporter()).toBeUndefined();
  });

  // Driven by importing the module rather than by calling an export, because
  // the module deliberately has no exports — see the file for why an export
  // would drag the whole SDK into every page.
  it('points the browser SDK at the public DSN', async () => {
    vi.stubEnv('NEXT_PUBLIC_BUGSINK_DSN', DSN);

    await import('../instrumentation-client');

    await vi.waitFor(() =>
      expect(browserSdk.init).toHaveBeenCalledWith({
        dsn: DSN,
        tracesSampleRate: 0,
        environment: undefined,
      }),
    );
    expect(installedReporter()).toBeInstanceOf(Function);
  });
});

/**
 * The bundle-shaped half of the gate, guarded structurally because no mock can
 * see it: both cases below pass every other suite, every typecheck and the
 * build, and fail only as 438 KB of SDK downloaded by a reader whose app was
 * never going to report anything. Same reason config.test.ts reads files rather
 * than imports them — what these hold shut is the shape of the build output.
 */
describe('keeping the browser SDK out of a build with no DSN', () => {
  const appFile = (name: string) =>
    readFileSync(join(import.meta.dirname, '..', name), 'utf8');

  // Next inlines a `NEXT_PUBLIC_*` read only when the variable EXISTS. An unset
  // one stays a live `process.env` lookup, so the DSN guard stays a runtime
  // branch and nothing can be eliminated — and Turbopack chunks
  // @sentry/browser TOGETHER with the module importing it, not behind it, so
  // every page pays for the whole SDK. Defined so it can be dropped.
  it('normalises the public DSN to a defined value at build time', () => {
    const config = appFile('next.config.mjs');

    expect(config).toMatch(
      /env: \{ NEXT_PUBLIC_BUGSINK_DSN: process\.env\.NEXT_PUBLIC_BUGSINK_DSN \?\? '' \}/,
    );
  });

  // An export keeps the dynamic import reachable from outside, and the dead
  // branch stops being dead. The module is deliberately side-effect-only.
  it('exports nothing from instrumentation-client.ts', () => {
    const source = appFile('instrumentation-client.ts');

    expect(source).not.toMatch(/^export\b/m);
  });
});
