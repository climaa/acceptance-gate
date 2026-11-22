import type { CSSProperties } from 'react';

export interface Hotspot {
  /** The file, as the plot labels it: `comparison.ts`. */
  path: string;
  /** How often it changed: commits in the window the axis names. */
  churn: number;
  /** How tangled it is, per line. */
  complexity: number;
  /** Sizes the dot against the others, such as the file's lines. */
  weight?: number;
  /** A refactor target: drawn in ink rather than muted. */
  hot?: boolean;
  /** Writes the path beside the dot, after it or before and above it. */
  label?: 'end' | 'start';
}

export interface HotspotsProps {
  hotspots: Hotspot[];
  /** The churn axis' title: `commits in 6 months →`. */
  xLabel: string;
  /** The complexity axis' title: `complexity density ↑`. */
  yLabel: string;
  /** Names the high-churn, high-complexity quarter: `refactor here`. */
  quadrantLabel: string;
  /** Names the list of files for assistive technology. */
  label?: string;
  className?: string;
}

export interface HotspotAxis {
  max: number;
  ticks: number[];
  /** The decimals a tick label needs to tell the steps apart. */
  decimals: number;
}

export interface HotspotDot {
  hotspot: Hotspot;
  /** Across the plot from the left, as a fraction of its width. */
  x: number;
  /** Down the plot from the top, as a fraction of its height. */
  y: number;
  /** In CSS px. */
  diameter: number;
}

/** The smallest and largest dot the board draws, in CSS px. */
const DOT = { min: 16, max: 28 };
const STEPS = 3;

function niceStep(raw: number): number {
  const power = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / power;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return nice * power;
}

const fixed = (n: number, decimals: number) => +n.toFixed(decimals);

/**
 * An axis from 0 to the first round value at or above `max`, in about three
 * steps of 1, 2 or 5 times a power of ten. With nothing above 0 the axis runs
 * to 1.
 */
export function niceAxis(max: number): HotspotAxis {
  const top = Number.isFinite(max) && max > 0 ? max : 1;
  const step = niceStep(top / STEPS);
  const decimals = Math.max(0, -Math.floor(Math.log10(step)));
  const count = Math.ceil(top / step - 1e-9);
  const ticks = Array.from({ length: count + 1 }, (_, i) => fixed(i * step, decimals));
  return { max: ticks.at(-1)!, ticks, decimals };
}

const plottable = ({ churn, complexity }: Hotspot) =>
  Number.isFinite(churn) && churn >= 0 && Number.isFinite(complexity) && complexity >= 0;

/**
 * Each file placed on the plot, churn across and complexity up, its dot sized
 * by weight between the smallest and largest drawn. Weights that are missing
 * or all equal draw every dot at the middle size.
 */
export function hotspotDots(
  hotspots: Hotspot[],
  axes: { x: HotspotAxis; y: HotspotAxis },
): HotspotDot[] {
  const shown = hotspots.filter(plottable);
  const weights = shown.map(({ weight }) => weight).filter((w) => w !== undefined);
  const least = Math.min(...weights);
  const most = Math.max(...weights);
  const spread = most - least;

  return shown.map((hotspot) => {
    const { weight } = hotspot;
    const share = weight === undefined || !(spread > 0) ? 0.5 : (weight - least) / spread;
    return {
      hotspot,
      x: hotspot.churn / axes.x.max,
      y: 1 - hotspot.complexity / axes.y.max,
      diameter: DOT.min + share * (DOT.max - DOT.min),
    };
  });
}

const percent = (fraction: number) => `${+(fraction * 100).toFixed(4)}%`;

const place = (dot: HotspotDot) =>
  ({
    '--hotspot-x': percent(dot.x),
    '--hotspot-y': percent(dot.y),
    '--hotspot-size': `${dot.diameter / 16}rem`,
  }) as CSSProperties;

function describe({ path, churn, complexity, hot }: Hotspot) {
  const facts = `${path}: ${churn} commits, complexity density ${fixed(complexity, 2)}`;
  return hot ? `${facts}, refactor target` : facts;
}

/**
 * Files by churn and complexity. The quarter past both midpoints is where
 * refactoring pays; refactor targets are drawn in ink, the rest muted.
 */
export function Hotspots({
  hotspots,
  xLabel,
  yLabel,
  quadrantLabel,
  label,
  className,
}: HotspotsProps) {
  const x = niceAxis(Math.max(...hotspots.filter(plottable).map(({ churn }) => churn)));
  const y = niceAxis(
    Math.max(...hotspots.filter(plottable).map(({ complexity }) => complexity)),
  );
  const dots = hotspotDots(hotspots, { x, y });

  return (
    <div className={['ds-hotspots', className].filter(Boolean).join(' ')}>
      <div className="ds-hotspots__plot" aria-hidden="true">
        {y.ticks.map((tick) => (
          <span
            key={`y${tick}`}
            className="ds-hotspots__grid"
            style={{ insetBlockStart: percent(1 - tick / y.max) }}
          />
        ))}
        {y.ticks.map((tick) => (
          <span
            key={`yl${tick}`}
            className="ds-hotspots__y-tick"
            style={{ insetBlockStart: percent(1 - tick / y.max) }}
          >
            {tick.toFixed(y.decimals)}
          </span>
        ))}
        {x.ticks.map((tick) => (
          <span
            key={`xl${tick}`}
            className="ds-hotspots__x-tick"
            style={{ insetInlineStart: percent(tick / x.max) }}
          >
            {tick.toFixed(x.decimals)}
          </span>
        ))}
        <span className="ds-hotspots__quadrant ds-hotspots__quadrant--x" />
        <span className="ds-hotspots__quadrant ds-hotspots__quadrant--y" />
        <span className="ds-hotspots__y-title">{yLabel}</span>
        <span className="ds-hotspots__quadrant-title">{quadrantLabel}</span>
        {dots.map((dot) => (
          <span
            key={dot.hotspot.path}
            className={`ds-hotspots__dot ds-hotspots__dot--${dot.hotspot.hot ? 'hot' : 'cool'}`}
            style={place(dot)}
          />
        ))}
        {dots
          .filter(({ hotspot }) => hotspot.label)
          .map((dot) => (
            <span
              key={dot.hotspot.path}
              className={`ds-hotspots__label ds-hotspots__label--${dot.hotspot.label}`}
              style={place(dot)}
            >
              {dot.hotspot.path}
            </span>
          ))}
      </div>
      <span className="ds-hotspots__x-title" aria-hidden="true">
        {xLabel}
      </span>
      <ul className="ds-visually-hidden" aria-label={label}>
        {hotspots.filter(plottable).map((hotspot) => (
          <li key={hotspot.path}>{describe(hotspot)}</li>
        ))}
      </ul>
    </div>
  );
}
