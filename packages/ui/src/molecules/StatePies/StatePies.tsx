/** Where a route's boundary comes from: its own file, a parent's, or nowhere. */
export type BoundarySource = 'own' | 'inherited' | 'none';

export interface RouteState {
  /** The boundary counted: `loading`, `error`, `not-found`. */
  name: string;
  own: number;
  inherited: number;
  none: number;
}

export interface StatePiesProps {
  states: RouteState[];
  className?: string;
}

export interface PieSlice {
  source: BoundarySource;
  /** Where the slice begins, as a fraction of a turn clockwise from the top. */
  start: number;
  end: number;
}

const SOURCES: readonly BoundarySource[] = ['own', 'inherited', 'none'];

const count = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);

/** One slice per source that has routes, clockwise from the top in the order own, inherited, none. */
export function pieSlices(state: Omit<RouteState, 'name'>): PieSlice[] {
  const total = SOURCES.reduce((sum, source) => sum + count(state[source]), 0);
  if (total === 0) return [];

  let start = 0;
  return SOURCES.filter((source) => count(state[source]) > 0).map((source) => {
    const end = Math.min(1, start + count(state[source]) / total);
    const slice = { source, start, end: end > 1 - 1e-12 ? 1 : end };
    start = slice.end;
    return slice;
  });
}

/** The pie is drawn in a 100-unit box: centre 50, 50 and radius 50. */
const R = 50;
const round = (n: number) => +n.toFixed(4) + 0;

function pointAt(turn: number) {
  const angle = turn * 2 * Math.PI;
  return `${round(R + R * Math.sin(angle))} ${round(R - R * Math.cos(angle))}`;
}

/**
 * The SVG path of a slice. A whole pie is two half arcs, since an arc whose
 * ends meet draws nothing.
 */
export function slicePath({ start, end }: PieSlice): string {
  if (end - start >= 1) {
    return `M ${R} 0 A ${R} ${R} 0 1 1 ${R} ${2 * R} A ${R} ${R} 0 1 1 ${R} 0 Z`;
  }
  const large = end - start > 0.5 ? 1 : 0;
  return `M ${R} ${R} L ${pointAt(start)} A ${R} ${R} 0 ${large} 1 ${pointAt(end)} Z`;
}

function StatePie({ state }: { state: RouteState }) {
  return (
    <li className="ds-state-pies__state">
      <svg className="ds-state-pies__pie" viewBox="0 0 100 100" aria-hidden="true">
        {pieSlices(state).map((slice) => (
          <path
            key={slice.source}
            className={`ds-state-pies__slice ds-state-pies__slice--${slice.source}`}
            d={slicePath(slice)}
          />
        ))}
      </svg>
      <p className="ds-state-pies__name">{state.name}</p>
      <ul className="ds-state-pies__counts">
        {SOURCES.map((source) => (
          <li
            key={source}
            className={[
              'ds-state-pies__count',
              source === 'none' &&
                count(state.none) > 0 &&
                'ds-state-pies__count--missing',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {`${count(state[source])} ${source}`}
          </li>
        ))}
      </ul>
    </li>
  );
}

/**
 * The routes' loading, error and not-found boundaries, one pie each: how many
 * routes have their own, inherit a parent's, or have none.
 */
export function StatePies({ states, className }: StatePiesProps) {
  return (
    <ul className={['ds-state-pies', className].filter(Boolean).join(' ')}>
      {states.map((state) => (
        <StatePie key={state.name} state={state} />
      ))}
    </ul>
  );
}
