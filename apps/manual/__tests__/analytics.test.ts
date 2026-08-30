import { createElement } from 'react';
// Imported explicitly rather than relying on `globals: true` — same reason as
// pages.test.ts: tsconfig's `**/*.ts` include means tsc typechecks this file.
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RootLayout from '@/app/layout';

/**
 * Who the page-view beacon reports for. The live manual, and nothing else: a
 * preview deployment builds with NODE_ENV=production like the real one, so the
 * package's own environment detection would happily count a reviewer clicking
 * through a login-protected preview as a reader.
 *
 * The gate is the subject here, not the vendor's script injection. The real
 * component reaches through `next/navigation` for the route it reports, and
 * `renderToStaticMarkup` mounts no App Router to answer — so a marker stands in
 * for it, and these assertions say only which branch the shell took.
 *
 * The static renderer suffices where apps/visual-diff-ui needed a streaming one:
 * this layout is a plain synchronous function, with no async component behind
 * <Suspense> for the static renderer to fail to resolve.
 */

// Hoisted above this file's own imports, so the factory cannot close over the
// `createElement` bound at the top — it has to reach for its own.
vi.mock('@vercel/analytics/next', async () => {
  const { createElement: h } = await import('react');

  return { Analytics: () => h('div', { 'data-analytics': 'vercel' }) };
});

/** The frame with no page in it — this decision is the same on every route. */
const shell = () => renderToStaticMarkup(createElement(RootLayout, null, null));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('the page-view beacon', () => {
  it('is wired into the shell on a production deployment', () => {
    vi.stubEnv('VERCEL_ENV', 'production');

    const html = shell();

    expect(html).toContain('data-analytics="vercel"');
  });

  // The case the gate exists for. Previews sit behind Vercel auth, so every
  // view they could report is a machine or a reviewer, landing in the same
  // dataset as the live manual.
  it('stays out of a preview deployment', () => {
    vi.stubEnv('VERCEL_ENV', 'preview');

    const html = shell();

    expect(html).not.toContain('data-analytics');
  });

  // Stubbed away rather than left ambient: a local `next build`, this suite and
  // the e2e lane's build all run with no deployment environment at all, and an
  // assertion that passes because a variable happened to be unset is not one.
  it('stays out of a build with no deployment environment', () => {
    vi.stubEnv('VERCEL_ENV', undefined);

    const html = shell();

    expect(html).not.toContain('data-analytics');
  });
});
