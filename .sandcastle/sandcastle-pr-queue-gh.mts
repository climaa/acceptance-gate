// `gh` wiring for the PR-queue reconciler. The rules it drives are pure and
// unit-tested in sandcastle-pr-queue.mts; this is the thin IO half, the same
// split sandcastle-git.mts / sandcastle-git-parse.mts already use.
//
// Every call here is scoped to the head branches THIS run owns: a PR opened by
// a human, on a branch no issue in this batch produced, is never read and never
// written to.
import { execSync } from 'node:child_process';
import { BASE_BRANCH } from './sandcastle-config.mts';
import {
  type QueueGateway,
  type QueueOutcome,
  parsePrQueueJson,
  reconcilePrQueue,
  summarizeQueueOutcome,
} from './sandcastle-pr-queue.mts';

/**
 * Gap between passes. A pass only makes progress once CI has re-run on the
 * branch the previous pass updated, so polling faster than this spends API
 * calls to learn nothing.
 */
export const QUEUE_PASS_INTERVAL_MS = 60_000;

/** Resolves on the timer OR on abort, so a SIGINT is not stuck behind it. */
function sleep(ms: number, abortSignal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (abortSignal.aborted) {
      resolve();
      return;
    }
    const done = (): void => {
      clearTimeout(timer);
      abortSignal.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    abortSignal.addEventListener('abort', done, { once: true });
  });
}

function ghRead(command: string): string | null {
  try {
    return execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch {
    return null;
  }
}

function ghWrite(command: string): boolean {
  try {
    execSync(command, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

export function ghQueueGateway(
  branches: string[],
  abortSignal: AbortSignal,
): QueueGateway {
  const owned = new Set(branches);
  return {
    // An aborted run reports an empty queue, which is what stops the loop:
    // reconcilePrQueue returns as soon as nothing it owns is open.
    listOwnedPrs: () => {
      if (abortSignal.aborted) return [];
      const out = ghRead(
        `gh pr list --state open --base ${BASE_BRANCH} --limit 100 ` +
          `--json number,headRefName,state,mergeStateStatus,autoMergeRequest`,
      );
      return out === null
        ? []
        : parsePrQueueJson(out).filter((queued) => owned.has(queued.branch));
    },
    // Merges the base branch into the PR's head. This is the whole point of the
    // module: `strict` status checks refuse a stale branch and GitHub's
    // auto-merge will not refresh one.
    updateBranch: ({ pr }) => ghWrite(`gh pr update-branch ${pr}`),
    armAutoMerge: ({ pr }) => ghWrite(`gh pr merge ${pr} --squash --auto`),
    waitBeforeNextPass: () => sleep(QUEUE_PASS_INTERVAL_MS, abortSignal),
    log: (line) => console.log(line),
  };
}

/**
 * Keep this run's PRs mergeable until they land. Never throws: it runs after
 * the branches are already pushed and the PRs already open, so a gh blip must
 * degrade to "left for the next iteration's rescue", not take the phase down.
 */
export async function refreshQueuedPrs(
  branches: string[],
  abortSignal: AbortSignal,
): Promise<QueueOutcome | null> {
  if (branches.length === 0 || abortSignal.aborted) return null;
  console.log(
    `\n[pr-queue] reconciling ${branches.length} branch(es) against ` +
      `strict branch protection on ${BASE_BRANCH} …`,
  );
  try {
    const outcome = await reconcilePrQueue(ghQueueGateway(branches, abortSignal));
    console.log(`[pr-queue] ${summarizeQueueOutcome(outcome)}`);
    return outcome;
  } catch (err) {
    console.warn(`  ⚠ pr-queue reconciliation failed: ${(err as Error).message}`);
    return null;
  }
}
