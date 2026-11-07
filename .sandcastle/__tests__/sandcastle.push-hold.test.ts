import { HOLD_LABEL } from '../sandcastle-noop-issues.mts';
import { screenPlan } from '../sandcastle-orchestrator.mts';
import {
  type PushHold,
  type PushResult,
  failedGateChecks,
  formatRunSummary,
  pushHoldComment,
  pushOrHold,
} from '../sandcastle-push-hold.mts';
import type { IssueRef } from '../sandcastle-issue-ref.mts';

/**
 * A host push refused by the pre-push gate used to leave its issue open and
 * unlabelled: the merger retried the same push and failed, and the next
 * iteration's planner dispatched the issue again from scratch, on top of a
 * branch that already held the work, until an operator stopped the run.
 *
 * Real calls into pushOrHold and screenPlan; only the push and the gh writes
 * are stubbed, so what is asserted is what the next iteration would plan.
 */

const ref = (id: string): IssueRef => ({
  id,
  title: `issue ${id}`,
  branch: `sandcastle/issue-${id}-x`,
});

const GATE_FAILED = [
  '→ lint',
  '✗ lint — ESLint, per workspace. Warnings are errors here.',
  '→ test',
  '\x1b[31m✗ test — Unit and component suites, per workspace.\x1b[0m',
  '',
  '✗ gate (fast) — lint, test',
  'error: failed to push some refs to github.com:climaa/acceptance-gate.git',
].join('\n');

function stubs(results: Record<string, PushResult>) {
  return {
    push: vi.fn(async (branch: string) => results[branch]!),
    hold: vi.fn((_id: string, _body: string) => ({ commented: true, labeled: true })),
  };
}

describe('a failed host push holds its issue', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('keeps the issue out of the next iteration and labels it held', async () => {
    // Arrange
    const io = stubs({ 'sandcastle/issue-7-x': { ok: false, output: GATE_FAILED } });
    const holds = new Map<string, PushHold>();

    // Act
    const pushed = await pushOrHold([ref('7')], io, { iteration: 1, holds });
    const next = screenPlan(
      [{ issue: ref('7'), labels: [] }],
      new Set(),
      new Set(holds.keys()),
    );

    // Assert
    expect(pushed).toEqual([]);
    expect(next.eligible).toEqual([]);
    expect(next.held).toEqual(['7']);
    expect(io.hold).toHaveBeenCalledTimes(1);
    const [id, body] = io.hold.mock.calls[0]!;
    expect(id).toBe('7');
    expect(body).toContain('`lint`, `test`');
    expect(body).toContain('sandcastle/issue-7-x');
    expect(body).toContain(`--remove-label "${HOLD_LABEL}"`);
  });

  it('changes nothing when the push succeeds', async () => {
    // Arrange
    const io = stubs({ 'sandcastle/issue-8-x': { ok: true, output: '' } });
    const holds = new Map<string, PushHold>();

    // Act
    const pushed = await pushOrHold([ref('8')], io, { iteration: 1, holds });
    const next = screenPlan(
      [{ issue: ref('8'), labels: [] }],
      new Set(),
      new Set(holds.keys()),
    );

    // Assert
    expect(pushed).toEqual([ref('8')]);
    expect(holds.size).toBe(0);
    expect(io.hold).not.toHaveBeenCalled();
    expect(next.eligible.map((i) => i.id)).toEqual(['8']);
  });

  it('holds only the refused branch and still returns the rest for the merger', async () => {
    // Arrange
    const io = stubs({
      'sandcastle/issue-1-x': { ok: true, output: '' },
      'sandcastle/issue-2-x': { ok: false, output: GATE_FAILED },
      'sandcastle/issue-3-x': { ok: true, output: '' },
    });
    const holds = new Map<string, PushHold>();

    // Act
    const pushed = await pushOrHold([ref('1'), ref('2'), ref('3')], io, {
      iteration: 2,
      holds,
    });

    // Assert
    expect(pushed.map((r) => r.id)).toEqual(['1', '3']);
    expect([...holds.values()]).toEqual([
      { id: '2', branch: 'sandcastle/issue-2-x', checks: ['lint', 'test'] },
    ]);
  });

  it('skips an issue whose durable hold label an earlier run set', () => {
    // Arrange / Act
    const next = screenPlan([{ issue: ref('9'), labels: [HOLD_LABEL] }], new Set());

    // Assert
    expect(next.eligible).toEqual([]);
    expect(next.held).toEqual(['9']);
  });
});

describe('failedGateChecks', () => {
  it("reads the gate's closing line", () => {
    // Arrange / Act
    const checks = failedGateChecks(GATE_FAILED);

    // Assert
    expect(checks).toEqual(['lint', 'test']);
  });

  it('falls back to the per-check lines when the closing line is missing', () => {
    // Arrange
    const cut = GATE_FAILED.split('\n').slice(0, 4).join('\n');

    // Act
    const checks = failedGateChecks(cut);

    // Assert
    expect(checks).toEqual(['lint', 'test']);
  });

  it('names nothing when the push failed outside the gate', () => {
    // Arrange / Act
    const checks = failedGateChecks('! [rejected] x -> x (non-fast-forward)');

    // Assert
    expect(checks).toEqual([]);
  });
});

describe('pushHoldComment', () => {
  it('says so when no gate check is named, and fences the output safely', () => {
    // Arrange / Act
    const body = pushHoldComment({
      id: '4',
      branch: 'sandcastle/issue-4-x',
      iteration: 3,
      checks: [],
      output: 'fatal: ```could not read```',
    });

    // Assert
    expect(body).toContain('without naming a gate check');
    expect(body).toContain("fatal: '''could not read'''");
    expect(body).toContain('(iteration 3)');
  });
});

describe('formatRunSummary', () => {
  it('lists held pushes under their own heading, apart from no-ops', () => {
    // Arrange / Act
    const summary = formatRunSummary({
      noOpIds: ['5'],
      holds: [{ id: '7', branch: 'sandcastle/issue-7-x', checks: ['lint'] }],
    });

    // Assert
    expect(summary).toContain('no-op:\n  #5');
    expect(summary).toContain('push failed — held:\n  #7 (sandcastle/issue-7-x) — lint');
  });

  it('is null when the run set nothing aside', () => {
    // Arrange / Act / Assert
    expect(formatRunSummary({ noOpIds: [], holds: [] })).toBeNull();
  });
});
