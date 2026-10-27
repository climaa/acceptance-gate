import { notFound } from 'next/navigation';
import { readBoardHomes } from '@/lib/board-homes';
import { resolveDataDir } from '@/lib/data';
import { repoRoot } from '@/lib/git';
import { readSetLedger } from '@/lib/set-ledger';
import { readSetShots } from '@/lib/set-shots';
import { shotProps } from '@/lib/shot-props';
import { type ShotEntry, ShotView } from './ShotView';

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
  const props = shots && shotProps(label, shots, key);
  if (!props) notFound();

  return (
    // Keyed by the shot, so a walk to the next one starts its tools afresh
    // instead of carrying this one's crop and nudges over.
    <ShotView
      key={key}
      {...props}
      ledger={await readSetLedger(label, key)}
      homes={await readBoardHomes()}
      entry={entry}
    />
  );
}
