import { CANONICAL_LABEL } from '@/lib/baselines';
import { guardMutation } from '@/lib/guard';
import { PURGE, SETS_TAG } from '@/lib/tags';
import { hasSet, holderOf, removeSet } from '@/lib/jobs';
import { SetLabelSchema } from '@/lib/job-contract';
import {
  CANONICAL_IS_COMMITTED,
  conflict,
  heldByWorktree,
  notFound,
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
 *
 * Ahead of both, `guardMutation` — including the local gate every mutation on
 * this console keeps, in one place now rather than in four. The argument for it
 * is strongest here: `next dev` listens on every interface, so a console started
 * against a real data directory is reachable from the network it is on — and a
 * capture set is a Storybook build and a containerised capture that cannot be
 * taken again without the checkout it came from. A report is a summary and its
 * shots; this is the thing on the console that cannot be remade.
 */
export async function DELETE(_request: Request, { params }: Context): Promise<Response> {
  const { label } = await params;
  const gate = await guardMutation();
  if (gate instanceof Response) return gate;
  const { dir } = gate;

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
