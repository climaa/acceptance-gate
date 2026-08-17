// Keeping the PR queue moving under strict branch protection.
//
// `main` requires branches to be up to date before merging
// (`required_status_checks.strict: true`). GitHub's auto-merge waits for
// checks but never updates a stale branch, so the moment one PR of a batch
// merges, every sibling flips to BEHIND and stops — permanently. A dispatch
// that opened twenty-six PRs merged one per iteration and stranded the rest
// until an external loop started calling `gh pr update-branch`.
//
// The rules live here, apart from the `gh` wiring in
// sandcastle-pr-queue-gh.mts, for the reason sandcastle-worktree-safety.mts
// and sandcastle-git-parse.mts already established: a decision that writes to
// GitHub should be testable against fabricated states, without a round-trip.
// Imports nothing on purpose.

/**
 * GitHub's `mergeStateStatus` enum. Anything outside it — the enum can grow —
 * is normalised to `UNKNOWN`, which is the state this module never acts on.
 */
export type PrMergeState =
  | 'BEHIND'
  | 'BLOCKED'
  | 'CLEAN'
  | 'DIRTY'
  | 'DRAFT'
  | 'HAS_HOOKS'
  | 'UNKNOWN'
  | 'UNSTABLE';

const MERGE_STATES: readonly string[] = [
  'BEHIND',
  'BLOCKED',
  'CLEAN',
  'DIRTY',
  'DRAFT',
  'HAS_HOOKS',
  'UNKNOWN',
  'UNSTABLE',
];

export type QueuedPr = {
  number: number;
  /** Head branch — how a PR is matched back to the run that owns it. */
  branch: string;
  state: 'OPEN' | 'CLOSED' | 'MERGED';
  mergeStateStatus: string;
  /** Whether `--squash --auto` is currently armed on the PR. */
  autoMergeEnabled: boolean;
  /**
   * Files this PR changes, or `null` when gh did not report it.
   *
   * Zero is the shape this module refuses to help along: a PR that changes
   * nothing still merges, and the `Closes #<ID>` line every merge-prompt body
   * carries then auto-closes an issue nobody resolved.
   */
  changedFiles: number | null;
};

export type QueueActionKind = 'update-branch' | 'arm-auto-merge' | 'needs-human' | 'wait';

export type QueueAction = {
  kind: QueueActionKind;
  pr: number;
  branch: string;
  /** Why, in one clause, for the run log. */
  reason: string;
};

/** Does this action write to GitHub? `needs-human` and `wait` never do. */
export function isWriteAction(action: QueueAction): boolean {
  return action.kind === 'update-branch' || action.kind === 'arm-auto-merge';
}

function normalizeMergeState(raw: string): PrMergeState {
  const upper = raw?.trim().toUpperCase() ?? '';
  return (MERGE_STATES.includes(upper) ? upper : 'UNKNOWN') as PrMergeState;
}

/**
 * What to do about one PR this pass.
 *
 * Only two states earn a write: BEHIND (strict protection will not update it
 * for us) and a lost auto-merge arming. DIRTY is a real conflict and produces
 * no write at all — auto-resolving one is what shipped a nested `@media` block
 * in a previous incident, so it is reported and left. DRAFT likewise: arming
 * auto-merge on a draft fails, so a repeating failed write would be the only
 * result. Everything else is CI doing its job — wait and look again next pass.
 *
 * A PR that changes no files is checked FIRST, ahead of every merge state.
 * This loop cannot open a PR and cannot close an issue, so it is not where an
 * empty-diff PR with an auto-closing `Closes #<ID>` comes from — merge-prompt.md
 * Step 1b is what stops that. But arming auto-merge on one is the last push that
 * outcome needs, and updating its branch is what makes it mergeable at all, so
 * neither write happens here either. Withholding the writes is the whole guard:
 * disarming an existing arming is deliberately NOT done, because GitHub computes
 * a PR's diff stats asynchronously and a freshly-opened PR can briefly report
 * zero. A withheld write costs one pass and self-heals; a disarm would take down
 * a legitimate PR on a transient reading.
 */
export function decideActions(queued: QueuedPr): QueueAction[] {
  if (queued.state !== 'OPEN') return [];
  const { number: pr, branch, changedFiles } = queued;

  // `null` (gh did not report a count) lands here too. "Has content" is the one
  // guess that can let the bad merge through, so an unreadable count is
  // reported rather than assumed away — the same fail-closed stance
  // worktreeDirtiness takes on a checkout it cannot inspect.
  if (changedFiles === null || changedFiles === 0) {
    const reason =
      changedFiles === 0
        ? 'PR changes no files — merging it would auto-close its issue with nothing landed'
        : 'gh did not report a changed-file count — cannot confirm the PR changes anything';
    return [{ kind: 'needs-human', pr, branch, reason }];
  }

  const status = normalizeMergeState(queued.mergeStateStatus);
  if (status === 'DIRTY') {
    return [
      {
        kind: 'needs-human',
        pr,
        branch,
        reason: 'merge conflict — Sandcastle never resolves conflicts',
      },
    ];
  }
  if (status === 'DRAFT') {
    return [
      { kind: 'needs-human', pr, branch, reason: 'PR is a draft — cannot auto-merge' },
    ];
  }

  const actions: QueueAction[] = [];
  if (status === 'BEHIND') {
    actions.push({
      kind: 'update-branch',
      pr,
      branch,
      reason: 'behind the base branch, which strict protection will not merge',
    });
  }
  if (!queued.autoMergeEnabled) {
    actions.push({
      kind: 'arm-auto-merge',
      pr,
      branch,
      reason: 'auto-merge is not armed',
    });
  }
  if (actions.length === 0) {
    actions.push({ kind: 'wait', pr, branch, reason: `waiting on checks (${status})` });
  }
  return actions;
}

/** Every action this pass, in PR order. */
export function planPass(prs: QueuedPr[]): QueueAction[] {
  return prs.flatMap(decideActions);
}

type RawPr = {
  number?: unknown;
  headRefName?: unknown;
  state?: unknown;
  mergeStateStatus?: unknown;
  autoMergeRequest?: unknown;
  changedFiles?: unknown;
};

/**
 * `gh pr list --json number,headRefName,state,mergeStateStatus,autoMergeRequest,changedFiles`.
 *
 * Reads anything malformed as an empty list: a gh blip must degrade to "nothing
 * to reconcile this pass", never to a crash in a phase that runs after the
 * branches are already pushed. An entry missing a field the state machine reads
 * is dropped rather than defaulted — a PR whose status did not arrive must not
 * present as CLEAN.
 *
 * `changedFiles` is the exception: it is carried through as `null` instead of
 * dropping the entry, so an unreported count still reaches `decideActions` and
 * still shows up in the pass's log and `stillOpen` list. Defaulting it to 0
 * would report every PR as empty; dropping the entry would make the same PR
 * invisible.
 */
export function parsePrQueueJson(stdout: string): QueuedPr[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout.trim());
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((entry: RawPr) => {
    if (typeof entry?.number !== 'number') return [];
    if (typeof entry.headRefName !== 'string') return [];
    if (typeof entry.state !== 'string') return [];
    if (typeof entry.mergeStateStatus !== 'string') return [];
    return [
      {
        number: entry.number,
        branch: entry.headRefName,
        state: entry.state as QueuedPr['state'],
        mergeStateStatus: entry.mergeStateStatus,
        autoMergeEnabled: Boolean(entry.autoMergeRequest),
        changedFiles: typeof entry.changedFiles === 'number' ? entry.changedFiles : null,
      },
    ];
  });
}

/** Everything the reconciler needs from the outside world. */
export type QueueGateway = {
  /** Open+recently-settled PRs whose head branch this run owns. */
  listOwnedPrs: () => QueuedPr[] | Promise<QueuedPr[]>;
  /** `gh pr update-branch` — true when it succeeded. */
  updateBranch: (action: QueueAction) => boolean;
  /** `gh pr merge --squash --auto` — true when it succeeded. */
  armAutoMerge: (action: QueueAction) => boolean;
  /** Let CI move before looking again. `pass` is the pass just finished. */
  waitBeforeNextPass: (pass: number) => Promise<void>;
  log: (line: string) => void;
};

export type QueueOutcome = {
  passes: number;
  updated: number[];
  armed: number[];
  /** Writes gh refused. */
  failed: number[];
  /** DIRTY, DRAFT, or nothing changed — reported, never touched. */
  conflicted: number[];
  stillOpen: number[];
  /** True when the pass cap was reached with PRs still open. */
  cappedOut: boolean;
};

/**
 * Default pass cap. Updating one branch re-breaks its siblings only when a PR
 * actually merges, so passes are consumed roughly one per merge — six covers
 * the batch sizes a single iteration produces, and the cap is what guarantees
 * this terminates when CI is simply slower than the loop.
 */
export const MAX_QUEUE_PASSES = 6;

const list = (prs: number[]): string => prs.map((n) => `#${n}`).join(', ');

/** One line for the run log — what the loop changed and what a human still owns. */
export function summarizeQueueOutcome(outcome: QueueOutcome): string {
  const parts = [`${outcome.passes} pass(es)`];
  if (outcome.updated.length > 0) parts.push(`updated ${list(outcome.updated)}`);
  if (outcome.armed.length > 0) parts.push(`re-armed ${list(outcome.armed)}`);
  if (outcome.failed.length > 0) parts.push(`gh refused ${list(outcome.failed)}`);
  if (outcome.conflicted.length > 0) {
    // No longer only conflicts — a PR that changes nothing lands here too, and
    // the per-PR log line above carries the actual reason.
    parts.push(`${list(outcome.conflicted)} need a human`);
  }
  parts.push(
    outcome.stillOpen.length === 0
      ? 'all owned PRs merged or closed'
      : `still open: ${list(outcome.stillOpen)}`,
  );
  return parts.join('; ');
}

type Tally = {
  updated: Set<number>;
  armed: Set<number>;
  failed: Set<number>;
  conflicted: Set<number>;
};

function applyAction(gateway: QueueGateway, action: QueueAction, tally: Tally): void {
  const { kind, pr, branch, reason } = action;
  if (kind === 'update-branch' || kind === 'arm-auto-merge') {
    const ok =
      kind === 'update-branch'
        ? gateway.updateBranch(action)
        : gateway.armAutoMerge(action);
    const done = kind === 'update-branch' ? tally.updated : tally.armed;
    if (ok) done.add(pr);
    else tally.failed.add(pr);
    gateway.log(`  ${ok ? '↻' : '⚠'} #${pr} (${branch}) ${kind}: ${reason}`);
    return;
  }
  if (kind === 'needs-human') {
    tally.conflicted.add(pr);
    gateway.log(`  ⚠ #${pr} (${branch}) needs a human: ${reason}`);
  }
}

/**
 * Loop until every owned PR has landed, or the cap is hit.
 *
 * A single sweep cannot work: updating one branch makes it mergeable, and the
 * merge that follows makes every sibling stale again. Each pass therefore
 * re-reads the queue rather than acting on the previous pass's view.
 *
 * Stops early on two states — no open PRs left (done), and nothing but
 * conflicted ones (waiting cannot change a conflict, and this loop will not
 * resolve one).
 */
export async function reconcilePrQueue(
  gateway: QueueGateway,
  maxPasses: number = MAX_QUEUE_PASSES,
): Promise<QueueOutcome> {
  const tally: Tally = {
    updated: new Set(),
    armed: new Set(),
    failed: new Set(),
    conflicted: new Set(),
  };
  let pass = 0;
  let stillOpen: number[] = [];
  let humanBlocked = false;

  while (pass < maxPasses) {
    pass++;
    const prs = await gateway.listOwnedPrs();
    const actions = planPass(prs);
    stillOpen = prs.filter((p) => p.state === 'OPEN').map((p) => p.number);
    if (stillOpen.length === 0) break;

    for (const action of actions) applyAction(gateway, action, tally);

    if (actions.every((a) => a.kind === 'needs-human')) {
      humanBlocked = true;
      gateway.log('  Every open PR needs a human — stopping the queue loop.');
      break;
    }
    if (pass < maxPasses) await gateway.waitBeforeNextPass(pass);
  }

  // Only a loop that ran out of passes with work left is a cap-out: stopping
  // because every remaining PR is a human's is a decision, not a budget.
  const cappedOut = !humanBlocked && pass === maxPasses && stillOpen.length > 0;
  if (cappedOut) {
    gateway.log(
      `  Queue pass cap (${maxPasses}) reached with ${stillOpen.length} PR(s) still open: ` +
        `${list(stillOpen)}. They keep their auto-merge arming.`,
    );
  }
  return {
    passes: pass,
    updated: [...tally.updated],
    armed: [...tally.armed],
    failed: [...tally.failed],
    conflicted: [...tally.conflicted],
    stillOpen,
    cappedOut,
  };
}
