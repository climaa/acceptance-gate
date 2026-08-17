import { SETS_TAG, resolveDataDir } from '@/lib/data';
import { SetLabelSchema, holderOf, listSets, removeSet } from '@/lib/jobs';
import {
  SAMPLE_DATA,
  badRequest,
  conflict,
  heldByWorktree,
  refuseWhileRunning,
} from '@/lib/refusals';
import { updateTag } from 'next/cache';
import { z } from 'zod';

/** How many of the latest sets survive. A whole number, and zero is legal —
 *  "keep none" is a thing a reviewer can mean, and the dialog that names every
 *  set about to go is what makes it deliberate. */
const PruneRequestSchema = z.object({ keep: z.number().int().min(0) });

/**
 * Prune everything but the latest `keep` capture sets (D2).
 *
 * "Latest" is `capturedAt`, descending — the order `listSets` returns and the
 * order the console shows, so the sets a reviewer sees at the top of the table
 * are exactly the ones this keeps.
 *
 * A held set is skipped, not refused: pruning is a bulk action, and one checked-
 * out worktree must not strand the other nine. Every skip comes back in the same
 * words a single delete would have refused with, so the panel renders one list
 * of sentences rather than one alert and one code.
 */
export async function POST(request: Request): Promise<Response> {
  const { dir, isSample } = await resolveDataDir();
  if (isSample) return conflict(SAMPLE_DATA);

  const busy = refuseWhileRunning(dir);
  if (busy) return busy;

  const parsed = PruneRequestSchema.safeParse(await readBody(request));
  if (!parsed.success) {
    return badRequest('prune needs a whole number of sets to keep');
  }

  const sets = listSets(dir).map((set) => set.label);
  const kept = sets.slice(0, parsed.data.keep);
  const removed: string[] = [];
  const refused: string[] = [];

  for (const label of sets.slice(parsed.data.keep)) {
    const reason = refusalFor(dir, label);
    if (reason) {
      refused.push(reason);
      continue;
    }

    removeSet(dir, label);
    removed.push(label);
  }

  // Only the set list moved. A report is a record of a decision and outlives the
  // sets it compared, so `vd:reports` is deliberately left alone.
  updateTag(SETS_TAG);

  return Response.json({ kept, removed, refused });
}

/**
 * Why this set survives the prune, or null when nothing spares it.
 *
 * The second reason is the confinement check at registry level: a `sets.json`
 * entry whose label is not a label — one carrying a separator, or a climb —
 * names a directory outside `<dataDir>/sets`, and a bulk delete is the last
 * place that should be discovered. `within()` would throw and refuse the write
 * either way; refusing it here means the other nine sets still prune, and the
 * reviewer is told which entry is malformed.
 */
function refusalFor(dataDir: string, label: string): string | null {
  if (!SetLabelSchema.safeParse(label).success) {
    return `${label} is not a snapshot-set label — it names nothing this console can delete`;
  }

  const holder = holderOf(dataDir, label);

  return holder ? heldByWorktree(label, holder.path) : null;
}

async function readBody(request: Request): Promise<unknown> {
  try {
    return (await request.json()) as unknown;
  } catch {
    return null;
  }
}
