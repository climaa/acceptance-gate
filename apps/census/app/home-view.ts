import { cacheLife } from 'next/cache';

import { readCommitted } from '@/lib/committed.ts';
import { homeView, type HomeView } from '@/lib/home.ts';

/**
 * The home's view of the committed files. Cached because the stale rule reads
 * the clock, and under `cacheComponents` a prerendered route may only read it
 * inside a cache. Both the layout and the page ask, and get the same answer.
 *
 * `'days'`: the page is prerendered at build and regenerated about daily, so a
 * measurement nobody re-runs turns stale on the page without a redeploy. The
 * regeneration reads the same two files, which `next.config.mjs` ships with the
 * function for that reason.
 *
 * `process.cwd()` is the app's directory under `next build` and `next dev`, which
 * is where `pnpm census:measure` writes both files.
 */
export async function loadHomeView(): Promise<HomeView> {
  'use cache';
  cacheLife('days');
  return homeView(readCommitted(process.cwd()), Date.now());
}
