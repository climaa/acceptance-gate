export type ProfileBand = 'low' | 'medium' | 'high' | 'very-high';

export interface ProfileBarProps {
  /** The profile's name: `Function size`. */
  title: string;
  /** What the bands measure: `lines per function`. */
  unit: string;
  /** Percent of units in each band, low risk to very high. */
  shares: readonly [number, number, number, number];
  className?: string;
}

export interface ProfileSegment {
  band: ProfileBand;
  share: number;
  /** The segment's length as a fraction of the bar. */
  size: number;
}

const BANDS: readonly ProfileBand[] = ['low', 'medium', 'high', 'very-high'];
const BAND_LABEL: Record<ProfileBand, string> = {
  low: 'low',
  medium: 'medium',
  high: 'high',
  'very-high': 'very high',
};

const usable = (share: number) => (Number.isFinite(share) && share > 0 ? share : 0);

/**
 * The bands that hold any units, each sized by its share of all of them, so
 * shares that round to 99.9 still fill the bar.
 */
export function profileSegments(shares: readonly number[]): ProfileSegment[] {
  const total = shares.reduce((sum, share) => sum + usable(share), 0);
  if (total === 0) return [];
  return BANDS.map((band, i) => ({ band, share: usable(shares[i] ?? 0) }))
    .filter(({ share }) => share > 0)
    .map(({ band, share }) => ({ band, share, size: share / total }));
}

/** A share as the key reads it: `83.7%`, `9%`. */
export function formatShare(share: number): string {
  return `${+usable(share).toFixed(1)}%`;
}

/** One risk profile: a bar split into four bands of risk, keyed with each band's share. */
export function ProfileBar({ title, unit, shares, className }: ProfileBarProps) {
  const segments = profileSegments(shares);

  return (
    <div className={['ds-profile-bar', className].filter(Boolean).join(' ')}>
      <div className="ds-profile-bar__head">
        <p className="ds-profile-bar__title">{title}</p>
        <p className="ds-profile-bar__unit">{unit}</p>
      </div>
      <div className="ds-profile-bar__bar" aria-hidden="true">
        {segments.map(({ band, size }) => (
          <span
            key={band}
            className={`ds-profile-bar__segment ds-profile-bar__band--${band}`}
            style={{ flexGrow: +size.toFixed(6) }}
          />
        ))}
      </div>
      <ul className="ds-profile-bar__key" aria-label={title}>
        {BANDS.map((band, i) => (
          <li key={band} className="ds-profile-bar__key-item">
            <span
              aria-hidden="true"
              className={`ds-profile-bar__swatch ds-profile-bar__band--${band}`}
            />
            {`${BAND_LABEL[band]} ${formatShare(shares[i] ?? 0)}`}
          </li>
        ))}
      </ul>
    </div>
  );
}
