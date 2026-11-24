/**
 * A cell's colour. `success`, `warning` and `danger` are states; `heat-1` to
 * `heat-4` rank a measure from least to most; `neutral` is a node that only
 * groups others.
 */
export type IcicleTone =
  | 'neutral'
  | 'success'
  | 'warning'
  | 'danger'
  | 'heat-1'
  | 'heat-2'
  | 'heat-3'
  | 'heat-4';

export interface IcicleNode {
  /** The node's name, the cell's first line: `@gate/ui`. */
  label: string;
  /** The cell's second line: `3.4k lines · 98.9% lines covered`. */
  detail?: string;
  /** A leaf's size. A node with children is as heavy as they are together. */
  weight?: number;
  tone?: IcicleTone;
  children?: IcicleNode[];
}

export interface IcicleCell {
  node: IcicleNode;
  depth: number;
  /** Where the cell begins, as a fraction of the figure's width. */
  start: number;
  /** How much of the figure's width the cell takes, as a fraction. */
  size: number;
}

/**
 * How a label is set inside a cell, in CSS px: JetBrains Mono at --text-xs
 * advances 0.6em, and a cell keeps --space-2 of padding on each side and a
 * 2px seam at its end.
 */
const LABEL = { charWidth: 7.2, inset: 18, minChars: 4 };

const ELLIPSIS = '…';

const ownWeight = (weight: number | undefined) =>
  weight !== undefined && Number.isFinite(weight) && weight > 0 ? weight : 0;

export function nodeWeight(node: IcicleNode): number {
  if (!node.children?.length) return ownWeight(node.weight);
  return node.children.reduce((sum, child) => sum + nodeWeight(child), 0);
}

export function weighedChildren(node: IcicleNode) {
  return (node.children ?? [])
    .map((child) => ({ child, weight: nodeWeight(child) }))
    .filter(({ weight }) => weight > 0)
    .sort((a, b) => b.weight - a.weight);
}

/**
 * The partition: one row per depth, the root spanning the whole width and
 * each parent's span split among its children by weight, heaviest first. A
 * node with no weight takes no room and is left out.
 */
export function icicleRows(root: IcicleNode): IcicleCell[][] {
  const rows: IcicleCell[][] = [[{ node: root, depth: 0, start: 0, size: 1 }]];
  let parents = rows[0]!;

  while (parents.length > 0) {
    const row = parents.flatMap((parent) => splitCell(parent));
    if (row.length > 0) rows.push(row);
    parents = row;
  }
  return rows;
}

function splitCell(parent: IcicleCell): IcicleCell[] {
  const children = weighedChildren(parent.node);
  const total = children.reduce((sum, { weight }) => sum + weight, 0);
  let start = parent.start;

  return children.map(({ child, weight }) => {
    const size = (parent.size * weight) / total;
    const cell = { node: child, depth: parent.depth + 1, start, size };
    start += size;
    return cell;
  });
}

/**
 * The text a cell `width` px wide can show: the whole of it, or as much as fits
 * ending in an ellipsis. Below room for three characters and the ellipsis the
 * cell is left unlabelled, a short name included.
 */
export function fitLabel(text: string, width: number): string | undefined {
  if (!Number.isFinite(width)) return undefined;
  const room = Math.floor((width - LABEL.inset) / LABEL.charWidth + 1e-9);
  if (room < LABEL.minChars) return undefined;
  if (text.length <= room) return text;
  return text.slice(0, room - 1) + ELLIPSIS;
}
