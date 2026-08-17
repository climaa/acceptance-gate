import * as fs from 'node:fs';
import * as path from 'node:path';
import { SANDCASTLE, read, stripComments } from './helpers';
import {
  type QueueGateway,
  type QueuedPr,
  decideActions,
  isWriteAction,
  parsePrQueueJson,
  planPass,
  reconcilePrQueue,
  summarizeQueueOutcome,
} from '../sandcastle-pr-queue.mts';

/**
 * REAL unit tests, not source-text assertions: the queue rules live in
 * sandcastle-pr-queue.mts precisely so a fabricated PR state can be fed to them
 * without a GitHub round-trip.
 */

function pr(overrides: Partial<QueuedPr> = {}): QueuedPr {
  return {
    number: 42,
    branch: 'sandcastle/issue-1-thing',
    state: 'OPEN',
    mergeStateStatus: 'CLEAN',
    autoMergeEnabled: true,
    changedFiles: 3,
    ...overrides,
  };
}

describe('decideActions', () => {
  it('updates a BEHIND branch — strict protection never updates it for us', () => {
    // Arrange
    const behind = pr({ mergeStateStatus: 'BEHIND' });

    // Act
    const actions = decideActions(behind);

    // Assert
    expect(actions.map((a) => a.kind)).toEqual(['update-branch']);
    expect(actions[0]!.pr).toBe(42);
  });

  it('re-arms auto-merge on a BEHIND PR that has lost it, after the update', () => {
    // Arrange
    const behind = pr({ mergeStateStatus: 'BEHIND', autoMergeEnabled: false });

    // Act
    const actions = decideActions(behind);

    // Assert
    expect(actions.map((a) => a.kind)).toEqual(['update-branch', 'arm-auto-merge']);
  });

  it('never writes to a DIRTY PR — a real conflict is a human’s', () => {
    // Arrange
    const dirty = pr({ mergeStateStatus: 'DIRTY', autoMergeEnabled: false });

    // Act
    const actions = decideActions(dirty);

    // Assert
    expect(actions.map((a) => a.kind)).toEqual(['needs-human']);
    expect(actions.some(isWriteAction)).toBe(false);
  });

  it('never writes to a DRAFT PR — auto-merge cannot be armed on one', () => {
    // Arrange
    const draft = pr({ mergeStateStatus: 'DRAFT', autoMergeEnabled: false });

    // Act
    const actions = decideActions(draft);

    // Assert
    expect(actions.map((a) => a.kind)).toEqual(['needs-human']);
    expect(actions.some(isWriteAction)).toBe(false);
  });

  it('waits on a CLEAN armed PR', () => {
    // Arrange
    const clean = pr({ mergeStateStatus: 'CLEAN' });

    // Act
    const actions = decideActions(clean);

    // Assert
    expect(actions.map((a) => a.kind)).toEqual(['wait']);
  });

  it('arms a CLEAN PR that lost auto-merge', () => {
    // Arrange
    const clean = pr({ mergeStateStatus: 'CLEAN', autoMergeEnabled: false });

    // Act
    const actions = decideActions(clean);

    // Assert
    expect(actions.map((a) => a.kind)).toEqual(['arm-auto-merge']);
  });

  it('waits on a BLOCKED PR — checks are still running, nothing to fix', () => {
    // Arrange
    const blocked = pr({ mergeStateStatus: 'BLOCKED' });

    // Act
    const actions = decideActions(blocked);

    // Assert
    expect(actions.map((a) => a.kind)).toEqual(['wait']);
  });

  it('waits on UNKNOWN — GitHub computes mergeability asynchronously', () => {
    // Arrange
    const unknown = pr({ mergeStateStatus: 'UNKNOWN' });

    // Act
    const actions = decideActions(unknown);

    // Assert
    expect(actions.map((a) => a.kind)).toEqual(['wait']);
  });

  it('treats an unrecognised status as UNKNOWN rather than acting on it', () => {
    // Arrange — the enum can grow; a new member must not read as BEHIND.
    const exotic = pr({ mergeStateStatus: 'SOMETHING_NEW' });

    // Act
    const actions = decideActions(exotic);

    // Assert
    expect(actions.map((a) => a.kind)).toEqual(['wait']);
  });

  // A PR with zero changed files still merges, and the `Closes #<ID>` line the
  // merge prompt puts in every body then auto-closes an issue nobody resolved.
  // This loop cannot open such a PR — but it can arm auto-merge on one, which is
  // the last push the outcome needs.
  it('never writes to a PR that changes no files', () => {
    // Arrange
    const empty = pr({ changedFiles: 0, autoMergeEnabled: false });

    // Act
    const actions = decideActions(empty);

    // Assert
    expect(actions.map((a) => a.kind)).toEqual(['needs-human']);
    expect(actions.some(isWriteAction)).toBe(false);
    expect(actions[0]!.reason).toMatch(/no file|empty/i);
  });

  it('does not update a zero-change PR that is also BEHIND', () => {
    // Arrange — making it mergeable is exactly what must not happen.
    const empty = pr({ changedFiles: 0, mergeStateStatus: 'BEHIND' });

    // Act
    const actions = decideActions(empty);

    // Assert
    expect(actions.map((a) => a.kind)).toEqual(['needs-human']);
  });

  it('reports an unknown changed-file count as needing a human, not as content', () => {
    // Arrange — gh answered without the field (older gh, or a partial reply).
    // Guessing "has content" here is the one guess that can let the bad merge
    // through, so the loop declines to write and says so.
    const unknown = pr({ changedFiles: null, autoMergeEnabled: false });

    // Act
    const actions = decideActions(unknown);

    // Assert
    expect(actions.some(isWriteAction)).toBe(false);
  });

  it.each(['MERGED', 'CLOSED'] as const)('leaves a %s PR alone', (state) => {
    // Arrange
    const settled = pr({ state, mergeStateStatus: 'BEHIND', autoMergeEnabled: false });

    // Act
    const actions = decideActions(settled);

    // Assert
    expect(actions).toEqual([]);
  });
});

describe('planPass', () => {
  it('plans every open PR and skips the settled ones', () => {
    // Arrange
    const prs = [
      pr({ number: 1, mergeStateStatus: 'BEHIND' }),
      pr({ number: 2, mergeStateStatus: 'DIRTY' }),
      pr({ number: 3, state: 'MERGED' }),
      pr({ number: 4, mergeStateStatus: 'CLEAN', autoMergeEnabled: false }),
    ];

    // Act
    const actions = planPass(prs);

    // Assert
    expect(actions.map((a) => [a.pr, a.kind])).toEqual([
      [1, 'update-branch'],
      [2, 'needs-human'],
      [4, 'arm-auto-merge'],
    ]);
  });
});

describe('parsePrQueueJson', () => {
  const json = JSON.stringify([
    {
      number: 7,
      headRefName: 'sandcastle/issue-7-a',
      state: 'OPEN',
      mergeStateStatus: 'BEHIND',
      autoMergeRequest: { enabledAt: '2026-08-10T00:00:00Z' },
      changedFiles: 4,
    },
    {
      number: 8,
      headRefName: 'sandcastle/issue-8-b',
      state: 'OPEN',
      mergeStateStatus: 'CLEAN',
      autoMergeRequest: null,
      changedFiles: 0,
    },
  ]);

  it('reads gh pr list output into queued PRs', () => {
    // Act
    const parsed = parsePrQueueJson(json);

    // Assert
    expect(parsed).toEqual([
      {
        number: 7,
        branch: 'sandcastle/issue-7-a',
        state: 'OPEN',
        mergeStateStatus: 'BEHIND',
        autoMergeEnabled: true,
        changedFiles: 4,
      },
      {
        number: 8,
        branch: 'sandcastle/issue-8-b',
        state: 'OPEN',
        mergeStateStatus: 'CLEAN',
        autoMergeEnabled: false,
        changedFiles: 0,
      },
    ]);
  });

  it('reads an absent changed-file count as unknown rather than as zero', () => {
    // Arrange — zero would report a real PR as empty; the state machine gets to
    // decide what "unknown" means, and it declines to write.
    const noCount = JSON.stringify([
      {
        number: 9,
        headRefName: 'sandcastle/issue-9-c',
        state: 'OPEN',
        mergeStateStatus: 'CLEAN',
        autoMergeRequest: null,
      },
    ]);

    // Act / Assert
    expect(parsePrQueueJson(noCount)[0]!.changedFiles).toBeNull();
  });

  it('reads unparseable output as no PRs rather than throwing', () => {
    // Act / Assert — a gh blip must degrade to "nothing to do", not crash the run.
    expect(parsePrQueueJson('not json')).toEqual([]);
    expect(parsePrQueueJson('{}')).toEqual([]);
  });

  it('drops entries missing the fields the state machine reads', () => {
    // Arrange
    const partial = JSON.stringify([{ number: 9 }, { headRefName: 'x' }]);

    // Act / Assert
    expect(parsePrQueueJson(partial)).toEqual([]);
  });
});

type Recorded = { updated: number[]; armed: number[]; waits: number[]; logs: string[] };

function fakeGateway(
  passes: QueuedPr[][],
  recorded: Recorded,
  updateSucceeds = true,
): QueueGateway {
  let pass = 0;
  return {
    listOwnedPrs: () => passes[Math.min(pass++, passes.length - 1)] ?? [],
    updateBranch: (action) => {
      recorded.updated.push(action.pr);
      return updateSucceeds;
    },
    armAutoMerge: (action) => {
      recorded.armed.push(action.pr);
      return true;
    },
    waitBeforeNextPass: (n) => {
      recorded.waits.push(n);
      return Promise.resolve();
    },
    log: (line) => recorded.logs.push(line),
  };
}

function recorder(): Recorded {
  return { updated: [], armed: [], waits: [], logs: [] };
}

describe('reconcilePrQueue', () => {
  it('updates a BEHIND PR and stops once it has merged', async () => {
    // Arrange — pass 1 sees it BEHIND, pass 2 sees it merged.
    const recorded = recorder();
    const gateway = fakeGateway(
      [
        [pr({ number: 5, mergeStateStatus: 'BEHIND' })],
        [pr({ number: 5, state: 'MERGED' })],
      ],
      recorded,
    );

    // Act
    const outcome = await reconcilePrQueue(gateway);

    // Assert
    expect(recorded.updated).toEqual([5]);
    expect(outcome.passes).toBe(2);
    expect(outcome.stillOpen).toEqual([]);
    expect(outcome.cappedOut).toBe(false);
  });

  it('re-updates the siblings that one merge left behind', async () => {
    // Arrange — updating #1 lands it, which makes #2 stale in turn.
    const recorded = recorder();
    const gateway = fakeGateway(
      [
        [
          pr({ number: 1, mergeStateStatus: 'BEHIND' }),
          pr({ number: 2, mergeStateStatus: 'CLEAN' }),
        ],
        [
          pr({ number: 1, state: 'MERGED' }),
          pr({ number: 2, mergeStateStatus: 'BEHIND' }),
        ],
        [pr({ number: 1, state: 'MERGED' }), pr({ number: 2, state: 'MERGED' })],
      ],
      recorded,
    );

    // Act
    const outcome = await reconcilePrQueue(gateway);

    // Assert
    expect(recorded.updated).toEqual([1, 2]);
    expect(outcome.updated).toEqual([1, 2]);
    expect(outcome.passes).toBe(3);
  });

  it('terminates at the pass cap and reports what is still open', async () => {
    // Arrange — a PR that never leaves BEHIND (CI slower than the whole loop).
    const recorded = recorder();
    const gateway = fakeGateway(
      [[pr({ number: 3, mergeStateStatus: 'BEHIND' })]],
      recorded,
    );

    // Act
    const outcome = await reconcilePrQueue(gateway, 4);

    // Assert
    expect(outcome.passes).toBe(4);
    expect(recorded.updated).toEqual([3, 3, 3, 3]);
    expect(outcome.stillOpen).toEqual([3]);
    expect(outcome.cappedOut).toBe(true);
  });

  it('waits between passes but not after the last one', async () => {
    // Arrange
    const recorded = recorder();
    const gateway = fakeGateway(
      [[pr({ number: 3, mergeStateStatus: 'BEHIND' })]],
      recorded,
    );

    // Act
    await reconcilePrQueue(gateway, 3);

    // Assert
    expect(recorded.waits).toEqual([1, 2]);
  });

  it('makes no write and does not wait when every open PR is conflicted', async () => {
    // Arrange
    const recorded = recorder();
    const gateway = fakeGateway(
      [[pr({ number: 6, mergeStateStatus: 'DIRTY' })]],
      recorded,
    );

    // Act
    const outcome = await reconcilePrQueue(gateway, 5);

    // Assert
    expect(recorded.updated).toEqual([]);
    expect(recorded.armed).toEqual([]);
    expect(recorded.waits).toEqual([]);
    expect(outcome.passes).toBe(1);
    expect(outcome.conflicted).toEqual([6]);
    expect(outcome.cappedOut).toBe(false);
  });

  it('does not report a conflict stop on the last pass as a cap-out', async () => {
    // Arrange — stopping because a human is needed is not the cap being hit.
    const recorded = recorder();
    const gateway = fakeGateway(
      [[pr({ number: 6, mergeStateStatus: 'DIRTY' })]],
      recorded,
    );

    // Act
    const outcome = await reconcilePrQueue(gateway, 1);

    // Assert
    expect(outcome.cappedOut).toBe(false);
  });

  it('logs the conflicted PR as needing a human', async () => {
    // Arrange
    const recorded = recorder();
    const gateway = fakeGateway(
      [[pr({ number: 6, mergeStateStatus: 'DIRTY' })]],
      recorded,
    );

    // Act
    await reconcilePrQueue(gateway, 5);

    // Assert
    expect(recorded.logs.join('\n')).toMatch(/#6.*human/i);
  });

  it('records an update that gh refused rather than reporting it as done', async () => {
    // Arrange
    const recorded = recorder();
    const gateway = fakeGateway(
      [[pr({ number: 2, mergeStateStatus: 'BEHIND' })]],
      recorded,
      false,
    );

    // Act
    const outcome = await reconcilePrQueue(gateway, 1);

    // Assert
    expect(outcome.updated).toEqual([]);
    expect(outcome.failed).toEqual([2]);
  });

  it('returns immediately when this run owns no open PRs', async () => {
    // Arrange
    const recorded = recorder();
    const gateway = fakeGateway([[]], recorded);

    // Act
    const outcome = await reconcilePrQueue(gateway);

    // Assert
    expect(outcome.passes).toBe(1);
    expect(recorded.waits).toEqual([]);
    expect(outcome.stillOpen).toEqual([]);
  });
});

describe('summarizeQueueOutcome', () => {
  it('names the updated, conflicted and still-open PRs', () => {
    // Arrange
    const outcome = {
      passes: 3,
      updated: [1],
      armed: [2],
      failed: [],
      conflicted: [3],
      stillOpen: [3, 4],
      cappedOut: true,
    };

    // Act
    const summary = summarizeQueueOutcome(outcome);

    // Assert
    expect(summary).toMatch(/3 pass/);
    expect(summary).toMatch(/#1/);
    expect(summary).toMatch(/#3/);
    expect(summary).toMatch(/#4/);
  });

  it('says so plainly when there was nothing to do', () => {
    // Arrange
    const outcome = {
      passes: 1,
      updated: [],
      armed: [],
      failed: [],
      conflicted: [],
      stillOpen: [],
      cappedOut: false,
    };

    // Act / Assert
    expect(summarizeQueueOutcome(outcome)).toMatch(/all owned PRs .*(merged|closed)/i);
  });
});

describe('sandcastle-pr-queue-gh.mts — the gh wiring', () => {
  const source = read('sandcastle-pr-queue-gh.mts');

  it('updates a stale branch with gh pr update-branch', () => {
    expect(source).toMatch(/gh pr update-branch/);
  });

  it('re-arms auto-merge as a squash auto-merge', () => {
    expect(source).toMatch(/gh pr merge \$\{[^}]+\} --squash --auto/);
  });

  it('reads the states the policy needs, including mergeStateStatus', () => {
    expect(source).toMatch(/gh pr list[\s\S]*mergeStateStatus/);
    expect(source).toMatch(/autoMergeRequest/);
  });

  it('asks gh for the changed-file count the empty-PR guard reads', () => {
    // Without the field in the --json list the guard would see `null` on every
    // PR and the loop would decline every write.
    expect(source).toMatch(/gh pr list[\s\S]*changedFiles/);
  });
});

describe('the queue loop never bypasses the gate', () => {
  const files = fs
    .readdirSync(SANDCASTLE)
    .filter((f) => f.endsWith('.mts') || f.endsWith('.md'))
    .concat(
      fs.readdirSync(path.join(SANDCASTLE, 'agent-docs')).map((f) => `agent-docs/${f}`),
    );

  it.each(files)('%s does not merge with --admin', (file) => {
    expect(stripComments(read(file))).not.toMatch(/--admin/);
  });

  // Relaxing `strict` would dodge the deadlock and hollow out the gate at the
  // same time: an up-to-date branch is what makes a green check mean something.
  it.each(files)('%s does not write to branch protection', (file) => {
    expect(stripComments(read(file))).not.toMatch(
      /gh api[^\n]*protection|--method (PUT|PATCH|DELETE)/,
    );
  });
});

describe('sandcastle-merge.mts — the merge phase runs the queue loop', () => {
  const source = read('sandcastle-merge.mts');

  it('reconciles the queue after the merger agent returns', () => {
    const runIdx = source.indexOf('sandcastle.run(');
    const refreshIdx = source.indexOf('refreshQueuedPrs(');
    expect(refreshIdx).toBeGreaterThan(runIdx);
  });

  it('passes the run’s own branches, not every open PR', () => {
    expect(source).toMatch(/refreshQueuedPrs\(\s*branches\.map/);
  });
});

describe('merge-prompt.md — the merger unsticks its own PRs while it waits', () => {
  const content = read('agent-docs/merge-prompt.md');

  it('updates a BEHIND PR from inside the poll loop', () => {
    const poll = content.slice(
      content.indexOf('## Step 4'),
      content.indexOf('## Step 5'),
    );
    expect(poll).toMatch(/BEHIND/);
    expect(poll).toMatch(/gh pr update-branch/);
  });

  it('reads mergeStateStatus, not just the PR state', () => {
    expect(content).toMatch(/mergeStateStatus/);
  });

  it('leaves a DIRTY PR to a human and never resolves the conflict', () => {
    expect(content).toMatch(/DIRTY/);
    const dirtyIdx = content.indexOf('DIRTY');
    expect(content.slice(dirtyIdx, dirtyIdx + 600)).toMatch(
      /do not.*(resolve|rebase|merge)|needs? (a )?human|manual/i,
    );
  });

  it('keeps the poll loop bounded', () => {
    expect(content).toMatch(/seq 1 40/);
  });
});
