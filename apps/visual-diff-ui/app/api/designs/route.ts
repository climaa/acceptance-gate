import * as fs from 'node:fs';
import * as path from 'node:path';
import { isDesignBoard } from '@/lib/comparison';
import { DESIGN_EXPORTS_DIR } from '@/lib/design-exports';

const notFound = () => new Response('Not found', { status: 404 });

/**
 * Cacheable for an hour in a browser and a year on the CDN, whose copy is per
 * deployment. A board changes only by a commit, so a deployment can never serve
 * a stale one; a local console whose boards were just re-exported can, for an
 * hour, which is the cost of not re-sending megabytes on every open.
 */
export const BOARD_CACHE_CONTROL = 'public, max-age=3600, s-maxage=31536000';

/**
 * A board's export sidecar: the board's size in design pixels and the scale its
 * PNG was exported at, written beside it at export time and held to the PNG by
 * `scripts/board-scale-integrity.mjs`. The shot view needs it to lay a crop of
 * the board over a screenshot at the screenshot's own scale.
 */
/** A JSON file beside a board's PNG: its export sidecar, or its tile map. */
async function sidecar(file: string): Promise<Response> {
  try {
    const text = await fs.promises.readFile(path.join(DESIGN_EXPORTS_DIR, file), 'utf8');

    return new Response(text, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': BOARD_CACHE_CONTROL,
      },
    });
  } catch {
    return notFound();
  }
}

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
  const params = new URL(request.url).searchParams;
  const board = params.get('board');
  if (!isDesignBoard(board)) return notFound();
  if (params.get('format') === 'json') return sidecar(`${board}.json`);
  if (params.get('format') === 'tiles') return sidecar(`${board}.tiles.json`);

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
