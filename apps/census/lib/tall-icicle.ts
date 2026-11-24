import { icicleRows, type IcicleCell, type IcicleNode, type IcicleTone } from '@gate/ui';

/** What the phone tile draws, in CSS px: a 900px figure, its cells 2px apart. */
const TALL = { height: 900, seam: 2, labelled: 30, detailed: 48 };

export interface TallCell {
  /** Where the cell begins and how much it takes, as percentages of the height. */
  start: string;
  size: string;
  tone: IcicleTone;
  /** Absent where the cell is too short for the line. */
  label?: string;
  detail?: string;
}

const percent = (fraction: number) => `${+(fraction * 100).toFixed(4)}%`;

function tallCell({ node, start, size }: IcicleCell): TallCell {
  const room = size * TALL.height - TALL.seam;
  const leaf = !node.children?.length;
  return {
    start: percent(start),
    size: percent(size),
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
export const tallColumns = (root: IcicleNode): TallCell[][] =>
  icicleRows(root).map((row) => row.map(tallCell));
