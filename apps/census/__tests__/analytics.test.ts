import { createElement, type ReactNode } from 'react';
// Imported explicitly rather than relying on `globals: true`: tsconfig's
// `**/*.ts` include means tsc typechecks this file.
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import RootLayout from '@/app/layout';

/**
 * Who the page-view beacon reports for. The live census, and nothing else: a
 * preview deployment builds with NODE_ENV=production like the real one, so the
 * package's own environment detection would happily count a reviewer clicking
 * through a login-protected preview as a reader. `apps/manual/__tests__/
 * analytics.test.ts` holds the same contract for the manual.
 *
 * The gate is the subject here, not the vendor's script injection or the frame.
 * The real component reaches through `next/navigation` for the route it
 * reports, and the frames read the query the same way, and
 * `renderToStaticMarkup` mounts no App Router to answer — so markers stand in
 * for all three, and these assertions say only which branch the shell took.
 *
 * The layout is async, because it reads the home's view for its frame: awaited
 * first, its element tree is then plain enough for the static renderer.
 */

// Hoisted above this file's own imports, so each factory reaches for its own
// `createElement` rather than closing over the one bound at the top.
vi.mock('@vercel/analytics/next', async () => {
  const { createElement: h } = await import('react');

  const { optOutBeforeSend } = await import('@gate/logger/analytics');

  // Which `beforeSend` it was handed, as a yes/no the markup can carry.
  return {
    Analytics: (props: { beforeSend?: unknown }) =>
      h('div', {
        'data-analytics': 'vercel',
        'data-owner-opt-out': String(props.beforeSend === optOutBeforeSend),
      }),
  };
});

vi.mock('@/components/CensusFrame', () => ({
  CensusFrame: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@/components/Filtered', () => ({
  FilteredFrame: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@/app/home-view', () => ({ loadHomeView: async () => ({}) }));

/** The frame with no page in it — this decision is the same on every route. */
const shell = async () =>
  renderToStaticMarkup(await RootLayout({ children: createElement('main') }));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('the page-view beacon', () => {
  it('is wired into the shell on a production deployment', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');

    const html = await shell();

    expect(html).toContain('data-analytics="vercel"');
  });

  // The owner's own visits — opted out once with ?va-disable=1 — are dropped in
  // the browser, by the beforeSend @gate/logger/analytics exports.
  it("drops the owner's own page views", async () => {
    vi.stubEnv('VERCEL_ENV', 'production');

    const html = await shell();

    expect(html).toContain('data-owner-opt-out="true"');
  });

  // The case the gate exists for. Previews sit behind Vercel auth, so every
  // view they could report is a machine or a reviewer, landing in the same
  // dataset as the live census.
  it('stays out of a preview deployment', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview');

    const html = await shell();

    expect(html).not.toContain('data-analytics');
  });

  // Stubbed away rather than left ambient: a local `next build`, this suite and
  // the e2e lane's build all run with no deployment environment at all.
  it('stays out of a build with no deployment environment', async () => {
    vi.stubEnv('VERCEL_ENV', undefined);

    const html = await shell();

    expect(html).not.toContain('data-analytics');
  });
});
