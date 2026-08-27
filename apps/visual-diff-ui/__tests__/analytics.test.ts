import { createElement, type ReactElement } from 'react';
import { renderToReadableStream } from 'react-dom/server';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.ts` include means tsc typechecks this file.
import { afterEach, describe, expect, it, vi } from 'vitest';
import RootLayout from '../app/layout';

/**
 * Who the page-view beacon reports for. The live console, and nothing else: a
 * preview deployment builds with NODE_ENV=production like the real one, so the
 * package's own environment detection would happily count a reviewer clicking
 * through a login-protected preview as a reader.
 *
 * The gate is the subject here, not the vendor's script injection. The real
 * component renders `null` and appends its <script> in an effect, which no
 * server render runs — so a marker stands in for it, and these assertions say
 * only which branch the shell took.
 *
 * A streaming renderer rather than `renderToStaticMarkup`, for the reason
 * app-shell.test.ts gives: the sample badge above this is an async component
 * behind <Suspense>, which the static renderer cannot resolve.
 */

// Hoisted above this file's own imports, so the factory cannot close over the
// `createElement` bound at the top — it has to reach for its own.
vi.mock('@vercel/analytics/next', async () => {
  const { createElement: h } = await import('react');

  return { Analytics: () => h('div', { 'data-analytics': 'vercel' }) };
});

/** The frame with no page in it — this decision is the same on every route. */
const shell = async (): Promise<string> => {
  const stream = await renderToReadableStream(
    createElement(RootLayout, null, null) as ReactElement,
  );
  await stream.allReady;

  return new Response(stream).text();
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('the page-view beacon', () => {
  it('is wired into the shell on a production deployment', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');

    const html = await shell();

    expect(html).toContain('data-analytics="vercel"');
  });

  // The case the gate exists for. Previews sit behind Vercel auth, so every
  // view they could report is a machine or a reviewer, landing in the same
  // dataset as the live console.
  it('stays out of a preview deployment', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview');

    const html = await shell();

    expect(html).not.toContain('data-analytics');
  });

  // Stubbed away rather than left ambient: a local `next build`, this suite and
  // the e2e lane's build all run with no deployment environment at all, and an
  // assertion that passes because a variable happened to be unset is not one.
  it('stays out of a build with no deployment environment', async () => {
    vi.stubEnv('VERCEL_ENV', undefined);

    const html = await shell();

    expect(html).not.toContain('data-analytics');
  });
});
