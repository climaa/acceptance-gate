import { describe, expect, it } from 'vitest';

import {
  type GuardedContext,
  guardAnalytics,
  isAnalyticsBeacon,
} from './analytics-guard';

type Listener = (request: { url(): string }) => void;

/** A context that records what the guard installed, and can replay a request. */
function fakeContext() {
  const installed = {
    matcher: undefined as ((url: URL) => boolean) | undefined,
    aborted: 0,
    initArg: undefined as unknown,
    initScript: undefined as ((key: string) => void) | undefined,
    listeners: [] as Listener[],
  };
  const context: GuardedContext = {
    async route(matcher, handler) {
      installed.matcher = matcher;
      await handler({
        abort: async () => {
          installed.aborted += 1;
        },
      });
    },
    async addInitScript(script, arg) {
      installed.initScript = script;
      installed.initArg = arg;
    },
    on(_event, listener) {
      installed.listeners.push(listener);
    },
  };
  const finish = (url: string) =>
    installed.listeners.forEach((l) => l({ url: () => url }));

  return { context, installed, finish };
}

describe('isAnalyticsBeacon', () => {
  it.each([
    'https://blog.carloslima.dev/_vercel/insights/script.js',
    'https://blog.carloslima.dev/_vercel/insights/view',
    'https://manual.carloslima.dev/0f1e2d3c4b5a6978/script.js',
    'https://visual-diff-ui.carloslima.dev/0f1e2d3c4b5a6978/view',
  ])('matches the beacon request %s', (url) => {
    // Arrange / Act
    const matched = isAnalyticsBeacon(url);

    // Assert
    expect(matched).toBe(true);
  });

  it.each([
    'https://blog.carloslima.dev/posts/view',
    'https://blog.carloslima.dev/_next/static/chunks/0f1e2d3c4b5a6978.js',
    'http://localhost:3100/about',
    'https://visual-diff-ui.carloslima.dev/set/baselines/shot/0f1e2d3c4b5a6978',
  ])('leaves an ordinary request alone: %s', (url) => {
    // Arrange / Act
    const matched = isAnalyticsBeacon(url);

    // Assert
    expect(matched).toBe(false);
  });
});

describe('guardAnalytics', () => {
  it('aborts the beacon and routes nothing else', async () => {
    // Arrange
    const { context, installed } = fakeContext();

    // Act
    await guardAnalytics(context);

    // Assert
    expect(installed.aborted).toBe(1);
    expect(
      installed.matcher?.(new URL('https://blog.carloslima.dev/_vercel/insights/view')),
    ).toBe(true);
    expect(installed.matcher?.(new URL('https://blog.carloslima.dev/about'))).toBe(false);
  });

  it('stores the same opt-out flag ?va-disable=1 stores', async () => {
    // Arrange
    const { context, installed } = fakeContext();
    const store = new Map<string, string>();
    const window = {
      localStorage: { setItem: (k: string, v: string) => store.set(k, v) },
    };
    Object.assign(globalThis, { window });

    // Act
    await guardAnalytics(context);
    installed.initScript?.(installed.initArg as string);

    // Assert
    expect(store.get('va-disable')).toBe('1');
    Reflect.deleteProperty(globalThis, 'window');
  });

  it('reports a beacon request that completed instead of being aborted', async () => {
    // Arrange
    const { context, finish } = fakeContext();
    const leaked = await guardAnalytics(context);

    // Act
    finish('https://blog.carloslima.dev/about');
    finish('https://blog.carloslima.dev/0f1e2d3c4b5a6978/view');

    // Assert
    expect(leaked()).toEqual(['https://blog.carloslima.dev/0f1e2d3c4b5a6978/view']);
  });
});
