import { parsePlanOutput, screenPlan } from '../sandcastle-orchestrator.mts';
import { NOOP_LABEL } from '../sandcastle-noop-issues.mts';
import type { IssueRef } from '../sandcastle-issue-ref.mts';

/**
 * REAL unit tests for the pure plan-handling logic extracted from main.mts's
 * loop. Both were previously reachable only through the running orchestrator,
 * so the suite could only regex-assert their source.
 */

describe('parsePlanOutput', () => {
  const planTag = (body: string) => `noise before <plan>${body}</plan> noise after`;
  const validPlan = JSON.stringify({
    issues: [{ id: '42', title: 'fix', branch: 'sandcastle/issue-42-fix' }],
  });

  it('extracts and validates the <plan> block', () => {
    // Arrange & Act
    const issues = parsePlanOutput(planTag(validPlan));

    // Assert
    expect(issues).toEqual([
      { id: '42', title: 'fix', branch: 'sandcastle/issue-42-fix' },
    ]);
  });

  it('throws (with the raw stdout) when no <plan> tag is present', () => {
    // Arrange & Act & Assert
    expect(() => parsePlanOutput('the agent rambled but never emitted a plan')).toThrow(
      /did not produce a <plan> tag/,
    );
  });

  it('propagates the injection gate — a hostile branch rejects the whole plan', () => {
    // Arrange
    const evil = JSON.stringify({
      issues: [{ id: '1', title: 'x', branch: 'sandcastle/issue-1-$(touch pwned)' }],
    });

    // Act & Assert
    expect(() => parsePlanOutput(planTag(evil))).toThrow(/invalid branch/);
  });
});

describe('screenPlan', () => {
  const entry = (
    id: string,
    labels: string[] = [],
  ): { issue: IssueRef; labels: string[] } => ({
    issue: { id, title: `issue ${id}`, branch: `sandcastle/issue-${id}-x` },
    labels,
  });

  it('keeps eligible issues and drops ones already marked no-op', () => {
    // Arrange — #2 is in the run-scoped no-op set.
    const entries = [entry('1'), entry('2'), entry('3')];

    // Act
    const { eligible, newlyNoOp, overrideErrors } = screenPlan(entries, new Set(['2']));

    // Assert — #2 is dropped from the run and re-reported (the caller re-adds it
    // idempotently and logs the skip, exactly as the old inline loop did).
    expect(eligible.map((i) => i.id)).toEqual(['1', '3']);
    expect(newlyNoOp).toEqual(['2']);
    expect(overrideErrors).toEqual([]);
  });

  it('reports an issue whose label marks it no-op via newlyNoOp, not eligible', () => {
    // Arrange — the issue carries the NOOP marker label.
    const entries = [entry('7', [NOOP_LABEL])];

    // Act
    const { eligible, newlyNoOp } = screenPlan(entries, new Set());

    // Assert
    expect(eligible).toEqual([]);
    expect(newlyNoOp).toEqual(['7']);
  });

  it('attaches parsed sc:* overrides to eligible issues', () => {
    // Arrange
    const entries = [entry('8', ['sc:implementer:sonnet-5'])];

    // Act
    const { eligible } = screenPlan(entries, new Set());

    // Assert
    expect(eligible).toHaveLength(1);
    expect(eligible[0]!.overrides?.implementer).toBeDefined();
  });

  it('collects invalid override labels as errors rather than dropping silently', () => {
    // Arrange — an unparseable control label.
    const entries = [entry('9', ['sc:implementer:not-a-real-model'])];

    // Act
    const { eligible, overrideErrors } = screenPlan(entries, new Set());

    // Assert — the issue is not run, and the error names it.
    expect(eligible).toEqual([]);
    expect(overrideErrors.join('\n')).toMatch(/#9/);
  });

  it('does not mutate the seen-no-op set it is given', () => {
    // Arrange
    const seen = new Set(['2']);

    // Act
    screenPlan([entry('2')], seen);

    // Assert — the caller owns adding to the set.
    expect([...seen]).toEqual(['2']);
  });
});
