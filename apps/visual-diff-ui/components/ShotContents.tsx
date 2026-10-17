import { notFound } from 'next/navigation';
import { resolveDataDir } from '@/lib/data';
import { repoRoot } from '@/lib/git';
import { readSetLedger } from '@/lib/set-ledger';
import { readSetShots, type SetShot, type SetShots } from '@/lib/set-shots';
import { setShotUrl } from '@/lib/shots';
import { type ShotEntry, ShotView } from './ShotView';

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
 * One screenshot of a set, read and handed to the shot view.
 *
 * `notFound()` for a set this instance cannot show and for a key the set does
 * not hold, so the view is only ever drawn over a shot that exists. The set's
 * own reader answers both, so this route can never come to disagree with the
 * set viewer about what a set holds.
 *
 * The readings come down the way the comparison's do: read here, on the server,
 * so the modal and the cold load share one read and the panel fetches nothing.
 */
export async function ShotContents({
  params,
  entry,
}: {
  params: Promise<{ label: string; key: string }>;
  entry: ShotEntry;
}) {
  const { label, key } = await params;
  const { dir } = await resolveDataDir();
  const shots = await readSetShots(dir, repoRoot(), label);
  const found = shots && findShot(shots, key);
  if (!found) notFound();

  const { shot, title } = found;
  const size = shot.width !== null && shot.height !== null;

  return (
    <ShotView
      label={label}
      title={`${title} · ${shot.viewport}/${shot.theme}`}
      tier={shot.tier}
      shot={{
        key: shot.key,
        src: setShotUrl(label, shot.file),
        // Unreachable while the set's reader is the one that found it, and said
        // anyway: a pane is never left blank without a sentence.
        absent: 'This screenshot could not be read.',
        caption: `screenshot · ${label}${size ? ` · ${shot.width}×${shot.height}` : ''}`,
        alt: `${shot.storyId}, ${shot.viewport} ${shot.theme}`,
        label: 'screenshot',
      }}
      ledger={await readSetLedger(label, key)}
      entry={entry}
    />
  );
}
