import * as path from 'node:path';

/**
 * Where the design boards are, by real path.
 *
 * Off `process.cwd()` — this app's directory under `next dev`, `next start` and
 * a deployed function alike — and never through a workspace link: the file
 * tracer records a symlinked file under its target, so a read through a link
 * works on every machine with an install and is ENOENT on a deployment. The
 * blog's cards answered 500 until they learned this (`apps/blog/lib/og.tsx`).
 */
export const DESIGN_EXPORTS_DIR = path.join(
  process.cwd(),
  '..',
  '..',
  'designs',
  'exports',
);
