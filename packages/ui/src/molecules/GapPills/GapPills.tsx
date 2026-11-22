import type { MeterHue } from '../../atoms/Meter/Meter';
import { dimensionHue, type CoverageDimension } from '../CoverageList/CoverageList';

export interface Gap {
  dimension: CoverageDimension;
  /** The column's name under its pill, short enough to fit: `accept.`. */
  label: string;
  count: number;
}

export interface GapPillsProps {
  gaps: Gap[];
  /** What the chart counts, read before the figures. */
  label?: string;
  className?: string;
}

/**
 * The plot as the board draws it, in CSS px: the axis labels take the left
 * 28, four columns share the 236 after them, and the pills stand on y 176
 * with the top gridline at y 16.
 */
const PLOT = { left: 28, width: 236, top: 16, base: 176 };
const PILL_WIDTH = 10;
const STEPS = 3;

export interface GapPill {
  /** The column's centre. */
  x: number;
  y: number;
  height: number;
}

export interface GapTick {
  value: number;
  y: number;
}

export function sortByCount<T extends { count: number }>(gaps: T[]): T[] {
  return [...gaps].sort((a, b) => b.count - a.count);
}

/** The gridline values: three whole, equal steps up to the largest count. */
export function gapAxis(counts: number[]): number[] {
  const step = Math.max(1, Math.ceil(Math.max(0, ...counts) / STEPS));
  return Array.from({ length: STEPS + 1 }, (_, i) => i * step);
}

/**
 * Each count as a pill standing on the baseline, one column each. A zero is
 * still drawn, as a dot as wide as a pill, so the column never reads as missing.
 */
export function gapPillLayout(counts: number[]) {
  const ticks = gapAxis(counts);
  const max = ticks.at(-1) ?? 1;
  const span = PLOT.base - PLOT.top;
  const column = PLOT.width / Math.max(1, counts.length);
  const toY = (value: number) => PLOT.base - (span * value) / max;

  return {
    ticks: ticks.map((value): GapTick => ({ value, y: toY(value) })),
    pills: counts.map((count, i): GapPill => {
      const height = Math.max(PILL_WIDTH, (span * count) / max);
      return { x: PLOT.left + column * (i + 0.5), y: PLOT.base - height, height };
    }),
  };
}

const px = (n: number) => `${n}px`;

/** The gap count per dimension, as pills in the dimensions' hues, largest first. */
export function GapPills({
  gaps,
  label = 'Gaps per dimension',
  className,
}: GapPillsProps) {
  const sorted = sortByCount(gaps);
  const { ticks, pills } = gapPillLayout(sorted.map((gap) => gap.count));
  const summary = sorted.map((gap) => `${gap.label} ${gap.count}`).join(', ');

  return (
    <div
      role="img"
      aria-label={`${label}: ${summary}`}
      className={['ds-gap-pills', className].filter(Boolean).join(' ')}
    >
      {ticks.map((tick) => (
        <span key={`grid-${tick.value}`}>
          <span className="ds-gap-pills__grid" style={{ top: px(tick.y) }} />
          <span className="ds-gap-pills__tick" style={{ top: px(tick.y) }}>
            {tick.value}
          </span>
        </span>
      ))}
      {sorted.map((gap, i) => {
        const pill = pills[i] as GapPill;
        const hue: MeterHue = dimensionHue(gap.dimension);
        return (
          <span key={gap.dimension}>
            <span
              className={`ds-gap-pills__pill ds-gap-pills__pill--${hue}`}
              style={{ left: px(pill.x), top: px(pill.y), height: px(pill.height) }}
            />
            <span
              className="ds-gap-pills__count"
              style={{ left: px(pill.x), top: px(pill.y) }}
            >
              {gap.count}
            </span>
            <span className="ds-gap-pills__label" style={{ left: px(pill.x) }}>
              {gap.label}
            </span>
          </span>
        );
      })}
    </div>
  );
}
