import { CANONICAL_LABEL } from '@/lib/baselines';
import { PURGE, SETS_TAG, resolveDataDir } from '@/lib/data';
import { SetLabelSchema, hasSet, holderOf, removeSet } from '@/lib/jobs';
import {
  CANONICAL_IS_COMMITTED,
  SAMPLE_DATA,
  conflict,
  heldByWorktree,
  notFound,
  refuseWhileRunning,
} from '@/lib/refusals';
import { revalidateTag } from 'next/cache';

interface Context {
  params: Promise<{ label: string }>;
}

/**
 * Delete one capture set (D2).
 *
 * The confirmation this answers is the client's — a dialog naming exactly what
 * is about to be removed — and this handler is what makes that promise true:
 * one set, its registry entry, and nothing else. It never cascades into the
 * reports that compared it, because a report is a record of a decision and the
 * set it was taken from is not part of it.
 *
 * Two things hold a set, and both refuse with the reason rather than a code:
 * a registered worktree has it checked out, or a job is reading the directory
 * right now.
 */
export async function DELETE(_request: Request, { params }: Context): Promise<Response> {
  const { label } = await params;
  const { dir, isSample } = await resolveDataDir();
  if (isSample) return conflict(SAMPLE_DATA);

  const busy = refuseWhileRunning(dir);
  if (busy) return busy;

  // Ahead of the miss below, and deliberately a refusal rather than a 404: the
  // corpus IS there, it just is not this console's to remove. Answering "no
  // capture set named baselines" would be false about a set the pickers offer.
  if (label === CANONICAL_LABEL) return conflict(CANONICAL_IS_COMMITTED);

  // A label that is not a label is a miss, not a refusal: answering anything
  // else would confirm what the shape of a real one is.
  if (!SetLabelSchema.safeParse(label).success || !hasSet(dir, label)) {
    return notFound(`no capture set named ${label}`);
  }

  const holder = holderOf(dir, label);
  if (holder) return conflict(heldByWorktree(label, holder.path), { worktree: holder });

  removeSet(dir, label);
  // Only the set list moved, so only it is refreshed: `vd:reports` names a list
  // this deletion did not change, and refreshing it would throw away a reader's
  // cached reports to say nothing.
  revalidateTag(SETS_TAG, PURGE);

  return Response.json({ removed: label });
}
