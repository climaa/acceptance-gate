import * as fs from 'node:fs';
import * as path from 'node:path';
import { isDesignBoard } from '@/lib/comparison';

const notFound = () => new Response('Not found', { status: 404 });

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

/**
 * Cacheable for an hour in a browser and a year on the CDN, whose copy is per
 * deployment. A board changes only by a commit, so a deployment can never serve
 * a stale one; a local console whose boards were just re-exported can, for an
 * hour, which is the cost of not re-sending megabytes on every open.
 */
export const BOARD_CACHE_CONTROL = 'public, max-age=3600, s-maxage=31536000';

/**
 * One design board, by name — `?board=` and nothing else.
 *
 * The name is checked against the allowlist before it becomes a path, so there
 * is no climb to refuse: an unknown name, a missing query and a board this
 * checkout does not have all answer the same 404.
 *
 * A query rather than a `[board]` segment, deliberately: `outputFileTracingIncludes`
 * keys are globs, a bracketed key matches nothing, and a key with no brackets is
 * the only kind known to ship its files.
 */
export async function GET(request: Request): Promise<Response> {
  const board = new URL(request.url).searchParams.get('board');
  if (!isDesignBoard(board)) return notFound();

  try {
    const bytes = await fs.promises.readFile(
      path.join(DESIGN_EXPORTS_DIR, `${board}.png`),
    );

    return new Response(bytes, {
      headers: {
        'Content-Type': 'image/png',
        'Content-Length': String(bytes.byteLength),
        'Cache-Control': BOARD_CACHE_CONTROL,
      },
    });
  } catch {
    return notFound();
  }
}
