import { dimensionHue } from '../CoverageList/CoverageList';

/** The three dimensions that count tests. Health counts none, so it has no band. */
export type PyramidDimension = 'code' | 'visual' | 'acceptance';

export interface PyramidBand {
  dimension: PyramidDimension;
  /** What the count counts: `Code · vitest cases`. */
  label: string;
  count: number;
}

export interface TestPyramidProps {
  /** Base first: the widest level, then each one stacked above it. */
  bands: PyramidBand[];
  className?: string;
}

export interface PyramidBox {
  width: number;
  bandHeight: number;
  /** The gap left between one band and the next. */
  gap: number;
}

export interface PyramidShape {
  /** Distance from the figure's top to the band's top edge. */
  top: number;
  /** Top-left, top-right, bottom-right, bottom-left. */
  points: [number, number][];
}

/** The figure as the board draws it, in the SVG's user units (1 unit = 1 CSS px). */
const BOX: PyramidBox = { width: 340, bandHeight: 86, gap: 6 };

const logOf = (count: number) =>
  Number.isFinite(count) && count > 1 ? Math.log(count) : 0;

/**
 * Each count's width on a log scale, the largest count spanning the full width.
 * A count of one or none has no logarithm to draw and gets no width.
 */
export function bandWidths(counts: number[], width: number): number[] {
  const logs = counts.map(logOf);
  const max = Math.max(0, ...logs);
  return logs.map((log) => (max === 0 ? 0 : (width * log) / max));
}

/**
 * The bands as trapezoids stacked base first from the bottom up. Each runs from
 * its own width at the bottom to the width of the band above it at the top, so
 * the outline climbs as one pyramid; the top band closes to a point.
 */
export function pyramidBands(counts: number[], box: PyramidBox): PyramidShape[] {
  const widths = bandWidths(counts, box.width);
  const centre = box.width / 2;
  const step = box.bandHeight + box.gap;
  const last = widths.length - 1;

  return widths.map((bottom, i) => {
    const top = widths[i + 1] ?? 0;
    const y = (last - i) * step;
    return {
      top: y,
      points: [
        [centre - top / 2, y],
        [centre + top / 2, y],
        [centre + bottom / 2, y + box.bandHeight],
        [centre - bottom / 2, y + box.bandHeight],
      ],
    };
  });
}

/**
 * How many times the lower band outnumbers the upper one: `40×`. Under ten keeps
 * one decimal, where rounding to a whole number would hide the difference.
 */
export function bandRatio(lower: number, upper: number): string | undefined {
  if (!(upper > 0) || !Number.isFinite(lower)) return undefined;
  const ratio = lower / upper;
  const shown = ratio >= 10 ? Math.round(ratio) : Number(ratio.toFixed(1));
  return `${shown}×`;
}

export function formatCount(count: number): string {
  return count.toLocaleString('en-US');
}

/** The testing pyramid: one band per level, its width the log of its count. */
export function TestPyramid({ bands, className }: TestPyramidProps) {
  const shapes = pyramidBands(
    bands.map((band) => band.count),
    BOX,
  );
  const height = bands.length * BOX.bandHeight + Math.max(0, bands.length - 1) * BOX.gap;
  const topDown = bands.map((band, i) => ({ band, shape: shapes[i]! })).reverse();

  return (
    <div className={['ds-test-pyramid', className].filter(Boolean).join(' ')}>
      <svg
        className="ds-test-pyramid__figure"
        viewBox={`0 0 ${BOX.width} ${height}`}
        width={BOX.width}
        height={height}
        aria-hidden="true"
      >
        {topDown.map(({ band, shape }) => (
          <polygon
            key={band.dimension}
            className={`ds-test-pyramid__band ds-test-pyramid__band--${dimensionHue(band.dimension)}`}
            points={shape.points.map(([x, y]) => `${x},${y}`).join(' ')}
          />
        ))}
      </svg>
      <ul className="ds-test-pyramid__counts">
        {topDown.map(({ band }) => (
          <li key={band.dimension} className="ds-test-pyramid__count">
            <span className="ds-test-pyramid__value">{formatCount(band.count)}</span>
            <span className="ds-test-pyramid__label">{band.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
