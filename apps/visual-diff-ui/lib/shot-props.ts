import type { ShotViewProps } from '@/components/ShotView';
import { neighbourKeys, type SetShot, type SetShots } from './set-view';
import { setShotUrl } from './shots';

/** What the shot view is told about one shot by the set it is in: everything
 *  but the readings, the board homes and the way in, which are read beside it. */
export type ShotProps = Omit<ShotViewProps, 'ledger' | 'homes' | 'entry'>;

/** The shot a key names in a set, with the title its story is grouped under. */
function findShot(shots: SetShots, key: string): { shot: SetShot; title: string } | null {
  for (const section of shots.sections) {
    for (const group of section.groups) {
      const shot = group.shots.find((candidate) => candidate.key === key);
      if (shot) return { shot, title: group.title };
    }
  }

  return null;
}

/**
 * One shot of a set as the shot view draws it, or null for a key the set does
 * not hold.
 *
 * Off the disk, so the route (components/ShotContents.tsx) and the shot screen's
 * story build the view from the same set the same way.
 */
export function shotProps(label: string, shots: SetShots, key: string): ShotProps | null {
  const found = findShot(shots, key);
  if (!found) return null;

  const { shot, title } = found;
  const { prev, next } = neighbourKeys(shots.sections, key);
  const size = shot.width !== null && shot.height !== null;

  return {
    label,
    story: title,
    storyId: shot.storyId,
    viewport: shot.viewport,
    theme: shot.theme,
    ...(shot.locale === undefined ? {} : { locale: shot.locale }),
    tier: shot.tier,
    shot: {
      key: shot.key,
      src: setShotUrl(label, shot.file),
      // Unreachable while the set's reader is the one that found it, and said
      // anyway: a pane is never left blank without a sentence.
      absent: 'This screenshot could not be read.',
      caption: `screenshot · ${label}${size ? ` · ${shot.width}×${shot.height}` : ''}`,
      alt: `${shot.storyId}, ${shot.viewport} ${shot.theme}${shot.locale === undefined ? '' : ` ${shot.locale}`}`,
      label: 'screenshot',
      ...(shot.width === null ? {} : { width: shot.width }),
    },
    ...(prev ? { prevKey: prev } : {}),
    ...(next ? { nextKey: next } : {}),
  };
}
