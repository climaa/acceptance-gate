export type MeterHue = 'chart' | 'chart-2' | 'chart-3' | 'chart-4';

export interface MeterProps {
  /** The accessible name: what the bar measures. */
  label: string;
  /** 0–100. `null` is unmeasured: no fill, a dashed track. */
  value: number | null;
  hue?: MeterHue;
  /** 0–100. Draws a tick where the value is expected not to fall below. */
  floor?: number;
  className?: string;
}

const clampPercent = (n: number) => (Number.isNaN(n) ? 0 : Math.min(100, Math.max(0, n)));

/**
 * A 6 px pill bar on its hue's tint track.
 *
 * An unmeasured value is not a meter: `role="meter"` requires `aria-valuenow`,
 * and inventing a 0 would announce a measurement that was never taken. It is an
 * image named for what it is instead.
 */
export function Meter({ label, value, hue = 'chart', floor, className }: MeterProps) {
  const classes = (state?: string) =>
    ['ds-meter', `ds-meter--${hue}`, state, className].filter(Boolean).join(' ');

  if (value === null) {
    return (
      <div
        role="img"
        aria-label={`${label}: unmeasured`}
        className={classes('ds-meter--unmeasured')}
      />
    );
  }

  const now = clampPercent(value);
  const tick = floor === undefined ? undefined : clampPercent(floor);

  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={now}
      aria-valuetext={tick === undefined ? undefined : `${now}%, floor ${tick}%`}
      className={classes(now === 0 ? 'ds-meter--empty' : undefined)}
    >
      {now > 0 && <span className="ds-meter__fill" style={{ width: `${now}%` }} />}
      {tick !== undefined && (
        <span className="ds-meter__floor" style={{ insetInlineStart: `${tick}%` }} />
      )}
    </div>
  );
}
