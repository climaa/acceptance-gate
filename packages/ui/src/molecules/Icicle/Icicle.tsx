'use client';

import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';

import {
  fitLabel,
  icicleRows,
  weighedChildren,
  type IcicleCell,
  type IcicleNode,
} from './geometry';

export interface IcicleProps {
  root: IcicleNode;
  /**
   * The width in CSS px the labels are fitted to until the figure is measured,
   * so the server and the client render the same first markup.
   */
  width?: number;
  /** Names the tree for assistive technology. */
  label?: string;
  className?: string;
}

/** The desktop canvas: the 1280px viewport less Storybook's 16px padding. */
const DEFAULT_WIDTH = 1248;

const percent = (fraction: number) => `${+(fraction * 100).toFixed(4)}%`;

/**
 * The figure's rendered width. A figure that is not displayed measures zero and
 * keeps the width it had.
 */
function useRenderedWidth(initial: number): [RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(initial);

  useEffect(() => {
    const figure = ref.current;
    if (!figure) return;

    const measure = () => {
      const rendered = figure.getBoundingClientRect().width;
      if (rendered > 0) setWidth(rendered);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(measure);
    observer.observe(figure);
    return () => observer.disconnect();
  }, []);

  return [ref, width];
}

/** A cell's place in its row, and the half of it its seam may not exceed. */
const cellStyle = ({ start, size }: IcicleCell) =>
  ({
    insetInlineStart: percent(start),
    inlineSize: percent(size),
    '--ds-icicle-half': percent(size / 2),
  }) as CSSProperties;

function IcicleCellView({ cell, width }: { cell: IcicleCell; width: number }) {
  const { node } = cell;
  const room = cell.size * width;
  const label = fitLabel(node.label, room);
  const detail = label && node.detail ? fitLabel(node.detail, room) : undefined;

  return (
    <div
      className={`ds-icicle__cell ds-icicle__cell--${node.tone ?? 'neutral'}`}
      style={cellStyle(cell)}
    >
      {label && <span className="ds-icicle__label">{label}</span>}
      {detail && <span className="ds-icicle__detail">{detail}</span>}
    </div>
  );
}

function IcicleTree({ node }: { node: IcicleNode }) {
  const children = weighedChildren(node);
  return (
    <li>
      {node.detail ? `${node.label} · ${node.detail}` : node.label}
      {children.length > 0 && (
        <ul>
          {children.map(({ child }, i) => (
            <IcicleTree key={i} node={child} />
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * A partition of a weighted tree: the root across the top, each level below
 * it split by weight, every cell coloured by its tone. The drawn cells cut
 * their labels to fit; a reader is given the whole tree as a nested list.
 */
export function Icicle({ root, width = DEFAULT_WIDTH, label, className }: IcicleProps) {
  const rows = icicleRows(root);
  const [figure, rendered] = useRenderedWidth(width);

  return (
    <div className={['ds-icicle', className].filter(Boolean).join(' ')}>
      <div ref={figure} className="ds-icicle__rows" aria-hidden="true">
        {rows.map((row, depth) => (
          <div key={depth} className="ds-icicle__row">
            {row.map((cell, i) => (
              <IcicleCellView key={i} cell={cell} width={rendered} />
            ))}
          </div>
        ))}
      </div>
      <ul className="ds-visually-hidden" aria-label={label}>
        <IcicleTree node={root} />
      </ul>
    </div>
  );
}
