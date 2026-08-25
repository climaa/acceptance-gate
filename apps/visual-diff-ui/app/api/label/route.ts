import { resolveDataDir } from '@/lib/data';
import { describeCheckout, repoRoot } from '@/lib/git';
import { freeLabel } from '@/lib/jobs';
import { branchLabel, today } from '@/lib/job-contract';

/**
 * What the next capture set would be called: `<branch>-<YYYY-MM-DD>`, with the
 * suffix that makes it free.
 *
 * The whole answer is composed here rather than assembled in the panel, and the
 * second half is why. `freeLabel` is the function `runCheck` applies to the
 * label this console posts (lib/runner.ts), so what the wand offers is what the
 * runner will actually write — a client counting `GET /api/sets` for itself
 * would be a second implementation of that walk, free to disagree with the one
 * that names the directory, and wrong twice before it started: `readSets` is
 * served through `cacheLife('seconds')`, and `sets.json` holds neither the
 * canonical corpus nor a shot tree written but not yet registered. `hasSet`
 * sees both.
 *
 * No `connection()` of its own — `resolveDataDir` calls one, for the reason
 * every route here has one: the work below is synchronous filesystem and git,
 * and without it `next build` would bake the build machine's branch into a
 * deployment. `no-store` at the other end for the reason `GET /api/env` has one:
 * a capture that finished a second ago changes this answer, and a cached
 * suggestion names a set that already exists.
 *
 * `null` is a real answer, not an error: no checkout, no `git` on PATH, or a
 * branch with no legal label left in it after sanitising. The panel draws no
 * name rather than a wrong one.
 *
 * Sample mode is deliberately not a case. The panel freezes its whole composer
 * there, so this is never asked; answering anyway is a read of the fixture tree,
 * and a branch nobody exercises is worse than a read nobody makes.
 */
export async function GET(): Promise<Response> {
  const { dir } = await resolveDataDir();
  const root = repoRoot();
  // `describeCheckout` also runs `status --porcelain`, whose answer this route
  // ignores. Three synchronous git calls on a click, each capped at 2 s by
  // lib/git — cheaper than a fourth wrapper that reads HEAD and nothing else.
  const checkout = root ? describeCheckout(root) : null;
  const base = checkout ? branchLabel(checkout.branch, today()) : null;

  return Response.json(
    { label: base ? freeLabel(dir, base) : null },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
