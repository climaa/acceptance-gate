import { Icicle, type IcicleNode } from '@gate/ui';

import { FILES_HEIGHT, tallColumns } from '@/lib/tall-icicle.ts';

interface TallIcicleProps {
  root: IcicleNode;
  label: string;
  /** How tall the phone tile draws the figure, in CSS px. */
  height?: number;
  className?: string;
}

/**
 * An Icicle that stands on end on a phone, which has no room for a block's width;
 * the sheet shows one drawing or the other. Both share the Icicle's nested list,
 * the only one a reader is given.
 */
export function TallIcicle({
  root,
  label,
  height = FILES_HEIGHT,
  className,
}: TallIcicleProps) {
  return (
    <div className={['census-icicle', className].filter(Boolean).join(' ')}>
      <Icicle root={root} label={label} />
      <div
        className="census-icicle__columns"
        style={{ blockSize: height }}
        aria-hidden="true"
      >
        {tallColumns(root, height).map((column, depth) => (
          <div key={depth} className="census-icicle__column">
            {column.map((cell, i) => (
              <div
                key={i}
                className={`census-icicle__cell ds-icicle__cell ds-icicle__cell--${cell.tone}`}
                style={{
                  insetBlockStart: cell.start,
                  blockSize: cell.size,
                  paddingBlockEnd: cell.seam,
                }}
              >
                {cell.label && <span className="ds-icicle__label">{cell.label}</span>}
                {cell.detail && <span className="ds-icicle__detail">{cell.detail}</span>}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
