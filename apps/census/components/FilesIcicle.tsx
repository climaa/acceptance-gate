import { Icicle, type IcicleNode } from '@gate/ui';

import { tallColumns } from '@/lib/tall-icicle.ts';

/**
 * A workspace's files by lines. A phone has no room for a file's width, so its
 * tile stands the figure on end; the sheet shows one drawing or the other. Both
 * share the Icicle's nested list, the only one a reader is given.
 */
export function FilesIcicle({ root, label }: { root: IcicleNode; label: string }) {
  return (
    <div className="census-icicle">
      <Icicle root={root} label={label} />
      <div className="census-icicle__columns" aria-hidden="true">
        {tallColumns(root).map((column, depth) => (
          <div key={depth} className="census-icicle__column">
            {column.map((cell, i) => (
              <div
                key={i}
                className={`census-icicle__cell ds-icicle__cell ds-icicle__cell--${cell.tone}`}
                style={{ insetBlockStart: cell.start, blockSize: cell.size }}
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
