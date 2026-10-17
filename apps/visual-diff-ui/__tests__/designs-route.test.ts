// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.ts` include means tsc typechecks this file.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BOARD_CACHE_CONTROL, DESIGN_EXPORTS_DIR, GET } from '../app/api/designs/route';
import { DESIGN_BOARDS, designBoardScaleUrl, designBoardUrl } from '../lib/comparison';

/**
 * The design boards' route: the four committed exports and nothing else.
 *
 * Read against the real `designs/exports/` — the files a deployment ships, by
 * the same real path the route reads, so a board renamed or deleted without the
 * allowlist following fails here rather than as a broken image.
 */

const ask = (query: string) => GET(new Request(`http://localhost/api/designs${query}`));

describe('GET /api/designs', () => {
  it.each(DESIGN_BOARDS)('serves the %s board as a PNG', async (board) => {
    const response = await ask(designBoardUrl(board).slice('/api/designs'.length));

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(bytes.byteLength).toBe(
      fs.statSync(path.join(DESIGN_EXPORTS_DIR, `${board}.png`)).size,
    );
  });

  it.each(DESIGN_BOARDS)('serves the %s board’s export scale as JSON', async (board) => {
    const response = await ask(designBoardScaleUrl(board).slice('/api/designs'.length));

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json');
    const { scale } = (await response.json()) as { scale: number };
    expect(scale).toBeGreaterThan(0);
  });

  it('answers a scale for a name off the allowlist with a 404', async () => {
    const response = await ask('?board=nope&format=json');

    expect(response.status).toBe(404);
  });

  it('lets the CDN keep a board, and a browser for an hour', async () => {
    const response = await ask('?board=pages');

    expect(response.headers.get('cache-control')).toBe(BOARD_CACHE_CONTROL);
  });

  it('answers a name off the allowlist with a 404', async () => {
    const response = await ask('?board=acceptance-gate');

    expect(response.status).toBe(404);
  });

  // The allowlist is the confinement: a climb is never turned into a path.
  it('answers a climb with a 404, without touching the disk', async () => {
    const response = await ask(`?board=${encodeURIComponent('../../package')}`);

    expect(response.status).toBe(404);
  });

  it('answers a request with no board with a 404', async () => {
    const response = await ask('');

    expect(response.status).toBe(404);
  });
});
