export interface Penalty {
  /** What the score was docked for: `Function size`. */
  name: string;
  /** How many of the 100 points it cost. */
  points: number;
}

export interface PenaltyBarsProps {
  title: string;
  /** Every penalty the score was measured against, those that cost nothing included. */
  penalties: Penalty[];
  className?: string;
}

export interface PenaltyBar {
  name: string;
  points: number;
  /** The bar's length as a fraction of the track; the costliest fills it. */
  size: number;
}

const costs = ({ points }: Penalty) => Number.isFinite(points) && points > 0;

/** The penalties that cost points, costliest first, each scaled against the costliest. */
export function penaltyBars(penalties: Penalty[]): PenaltyBar[] {
  const charged = penalties.filter(costs).sort((a, b) => b.points - a.points);
  const most = charged[0]?.points ?? 0;
  return charged.map(({ name, points }) => ({ name, points, size: points / most }));
}

/** Points docked, as the score reads them: `−1.8`. */
export function formatPenalty(points: number): string {
  return `−${+points.toFixed(1)}`;
}

const lowerFirst = (name: string) => name.charAt(0).toLowerCase() + name.slice(1);

/** The penalties that cost nothing, as one line of prose; none when every one costs. */
export function listFree(penalties: Penalty[]): string | undefined {
  const free = penalties
    .filter((penalty) => !costs(penalty))
    .map(({ name }) => lowerFirst(name));
  if (free.length === 0) return undefined;
  const last = free.pop()!;
  return `0 for ${free.length ? `${free.join(', ')} and ${last}` : last}`;
}

const percent = (fraction: number) => `${+(fraction * 100).toFixed(4)}%`;

/** What the health score was docked for: one bar per penalty, scaled to the costliest. */
export function PenaltyBars({ title, penalties, className }: PenaltyBarsProps) {
  const bars = penaltyBars(penalties);
  const note = listFree(penalties);

  return (
    <div className={['ds-penalty-bars', className].filter(Boolean).join(' ')}>
      <p className="ds-penalty-bars__title">{title}</p>
      <ul className="ds-penalty-bars__list" aria-label={title}>
        {bars.map(({ name, points, size }) => (
          <li key={name} className="ds-penalty-bars__row">
            <span className="ds-penalty-bars__name">{name}</span>
            <span className="ds-penalty-bars__track" aria-hidden="true">
              <span
                className="ds-penalty-bars__bar"
                style={{ inlineSize: percent(size) }}
              />
            </span>
            <span className="ds-penalty-bars__points">{formatPenalty(points)}</span>
          </li>
        ))}
      </ul>
      {note && <p className="ds-penalty-bars__note">{note}</p>}
    </div>
  );
}
