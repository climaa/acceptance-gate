import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import { type BoardHomes, DESIGN_BOARDS, type DesignBoard } from './comparison';
import { DESIGN_EXPORTS_DIR } from './design-exports';

const TileMapSchema = z.object({ tiles: z.record(z.string(), z.unknown()) });

/** A board's tile map's keys, or none: a reference board has no map, and a
 *  checkout whose boards were never exported has no file at all. */
async function tileKeys(board: DesignBoard): Promise<string[]> {
  try {
    const text = await fs.promises.readFile(
      path.join(DESIGN_EXPORTS_DIR, `${board}.tiles.json`),
      'utf8',
    );

    return Object.keys(TileMapSchema.parse(JSON.parse(text)).tiles);
  } catch {
    return [];
  }
}

/**
 * Which board draws each variant's tile, read off every board's tile map.
 *
 * Read on the server, where the maps are files, and handed down with the view:
 * the board a variant opens on is part of its address, so it has to be known on
 * the first render, not after a fetch. A tile drawn twice is the boards check's
 * red (scripts/board-scale-integrity.mjs); here the first board listed wins.
 */
export async function readBoardHomes(): Promise<BoardHomes> {
  const maps = await Promise.all(
    DESIGN_BOARDS.map(async (board) => ({ board, keys: await tileKeys(board) })),
  );
  const homes: Record<string, DesignBoard> = {};
  for (const { board, keys } of maps) {
    for (const key of keys) homes[key] ??= board;
  }

  return homes;
}
