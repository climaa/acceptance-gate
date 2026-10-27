import type { BoardHomes } from '@/lib/comparison';
import atoms from '../../../../designs/exports/01-atoms.tiles.json';
import molecules from '../../../../designs/exports/02-molecules.tiles.json';
import organisms from '../../../../designs/exports/03-organisms.tiles.json';
import templates from '../../../../designs/exports/04-templates.tiles.json';
import screens from '../../../../designs/exports/05-screens.tiles.json';

/**
 * The board each variant's tile is drawn on, as `readBoardHomes`
 * (lib/board-homes.ts) folds it off the tile maps: in board order, the first
 * board to draw a key keeps it. Imported rather than read, because a story runs
 * in the browser; `__tests__/screen-samples.test.ts` holds it to the reader, so a
 * board that gains a tile map fails there.
 */
const TILE_MAPS = [
  ['01-atoms', atoms],
  ['02-molecules', molecules],
  ['03-organisms', organisms],
  ['04-templates', templates],
  ['05-screens', screens],
] as const;

const homes: Record<string, (typeof TILE_MAPS)[number][0]> = {};
for (const [board, map] of TILE_MAPS) {
  for (const key of Object.keys(map.tiles)) homes[key] ??= board;
}

export const SAMPLE_HOMES: BoardHomes = homes;
