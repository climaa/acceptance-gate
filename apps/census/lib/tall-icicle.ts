import { icicleRows, type IcicleCell, type IcicleNode, type IcicleTone } from '@gate/ui';

/** What the phone tiles draw, in CSS px: cells 2px apart, and the least that holds a line or two. */
const TALL = { seam: 2, labelled: 30, detailed: 48 };

/** The workspace page's figure, in CSS px. */
export const FILES_HEIGHT = 900;

export interface TallCell {
  /** Where the cell begins and how much it takes, as percentages of the height. */
  start: string;
  size: string;
  /** The px of it left open before the next cell, never more than half of it. */
  seam: number;
  tone: IcicleTone;
  /** Absent where the cell is too short for the line. */
  label?: string;
  detail?: string;
}

const percent = (fraction: number) => `${+(fraction * 100).toFixed(4)}%`;

function tallCell({ node, start, size }: IcicleCell, height: number): TallCell {
  const share = size * height;
  const room = share - TALL.seam;
  const leaf = !node.children?.length;
  return {
    start: percent(start),
    size: percent(size),
    seam: Math.min(TALL.seam, share / 2),
    tone: node.tone ?? 'neutral',
    ...(room < TALL.labelled ? {} : { label: node.label }),
    ...(room < TALL.detailed || !leaf || node.detail === undefined
      ? {}
      : { detail: node.detail }),
  };
}

/**
 * The Icicle's partition stood on end: one column per depth, each cell as tall
 * as its weight. Only a file has room for its figure beside its name.
 */
export const tallColumns = (root: IcicleNode, height = FILES_HEIGHT): TallCell[][] =>
  icicleRows(root).map((row) => row.map((cell) => tallCell(cell, height)));
