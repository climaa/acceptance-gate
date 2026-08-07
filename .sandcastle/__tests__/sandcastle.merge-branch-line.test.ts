import { PROFILES } from '../sandcastle-agent-profiles.mts';
import {
  type BranchLineIssue,
  formatBranchLine,
  formatProfile,
} from '../sandcastle-merge-branch-line.mts';

/**
 * REAL unit tests — sandcastle-merge-branch-line.mts stays clear of
 * sandcastle-config.mts's import-time side effects, for the same reason as
 * sandcastle-noop-issues.test.ts.
 *
 * What is being protected: the merger's PR footer attributes which model
 * actually implemented/reviewed an issue. That resolution happens host-side
 * (PROFILES < env < issue label) so the merger agent only ever copies an
 * already-resolved string — it must never be asked to reproduce the
 * resolution itself.
 */

const ENV_KEYS = [
  'SC_IMPLEMENTER_MODEL',
  'SC_IMPLEMENTER_EFFORT',
  'SC_REVIEWER_MODEL',
  'SC_REVIEWER_EFFORT',
];

describe('formatProfile', () => {
  it('omits the effort separator when effort is unset', () => {
    // Arrange & Act
    const formatted = formatProfile({ model: 'claude-sonnet-5' });

    // Assert
    expect(formatted).toBe('claude-sonnet-5');
  });

  it('joins model and effort with the separator when effort is set', () => {
    // Arrange & Act
    const formatted = formatProfile({ model: 'claude-sonnet-5', effort: 'low' });

    // Assert
    expect(formatted).toBe('claude-sonnet-5·low');
  });
});

describe('formatBranchLine', () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
  });

  it('includes the branch, the issue id and the title', () => {
    // Arrange
    const issue: BranchLineIssue = {
      id: '32',
      title: 'attribute the model',
      branch: 'b-32',
    };

    // Act
    const line = formatBranchLine(issue);

    // Assert
    expect(line).toContain('branch: b-32');
    expect(line).toContain('issue: 32');
    expect(line).toContain('title: attribute the model');
  });

  it('falls back to the PROFILES default when no override is present', () => {
    // Arrange
    const issue: BranchLineIssue = {
      id: '1',
      title: 'no override',
      branch: 'b-1',
    };

    // Act
    const line = formatBranchLine(issue);

    // Assert
    expect(line).toContain(
      `implementer: ${PROFILES.implementer.model}·${PROFILES.implementer.effort}`,
    );
    expect(line).toContain(
      `reviewer: ${PROFILES.reviewer.model}·${PROFILES.reviewer.effort}`,
    );
  });

  it('uses the resolved implementer override when the issue label sets one', () => {
    // Arrange
    const issue: BranchLineIssue = {
      id: '2',
      title: 'with override',
      branch: 'b-2',
      overrides: { implementer: { model: 'claude-sonnet-5', effort: 'low' } },
    };

    // Act
    const line = formatBranchLine(issue);

    // Assert
    expect(line).toContain('implementer: claude-sonnet-5·low');
    expect(line).toContain(
      `reviewer: ${PROFILES.reviewer.model}·${PROFILES.reviewer.effort}`,
    );
  });

  it('uses the resolved reviewer override independently of the implementer', () => {
    // Arrange
    const issue: BranchLineIssue = {
      id: '3',
      title: 'reviewer override',
      branch: 'b-3',
      overrides: { reviewer: { model: 'claude-sonnet-5', effort: 'medium' } },
    };

    // Act
    const line = formatBranchLine(issue);

    // Assert
    expect(line).toContain(
      `implementer: ${PROFILES.implementer.model}·${PROFILES.implementer.effort}`,
    );
    expect(line).toContain('reviewer: claude-sonnet-5·medium');
  });

  it('resolves a run-level env override (alias expanded) for an unlabelled issue', () => {
    // Arrange
    process.env.SC_REVIEWER_MODEL = 'sonnet-5';
    process.env.SC_REVIEWER_EFFORT = 'medium';
    const issue: BranchLineIssue = {
      id: '4',
      title: 'env override',
      branch: 'b-4',
    };

    // Act
    const line = formatBranchLine(issue);

    // Assert
    expect(line).toContain('reviewer: claude-sonnet-5·medium');
  });
});
