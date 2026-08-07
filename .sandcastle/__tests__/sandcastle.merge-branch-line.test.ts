import { PROFILES } from '../sandcastle-agent-profiles.mts';
import {
  formatBranchLine,
  formatProfile,
} from '../sandcastle-merge-branch-line.mts';

/**
 * REAL unit tests — sandcastle-merge-branch-line.mts imports only
 * sandcastle-agent-profiles.mts and sandcastle-model-overrides.mts (types),
 * neither of which pulls in sandcastle-config.mts's import-time side effects,
 * for the same reason as sandcastle-noop-issues.test.ts.
 *
 * What is being protected: the merger's PR footer needs to attribute which
 * model actually implemented/reviewed an issue. That resolution happens
 * host-side (PROFILES < env < issue label) so the merger agent only ever
 * copies an already-resolved string — it must never be asked to reproduce
 * the resolution itself.
 */

const ENV_KEYS = [
  'SC_IMPLEMENTER_MODEL',
  'SC_IMPLEMENTER_EFFORT',
  'SC_REVIEWER_MODEL',
  'SC_REVIEWER_EFFORT',
];

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

  it('includes branch, issue and title as before', () => {
    // Arrange
    const issue = { id: '32', title: 'attribute the model', branch: 'b-32' };

    // Act
    const line = formatBranchLine(issue);

    // Assert
    expect(line).toContain('branch: b-32');
    expect(line).toContain('issue: 32');
    expect(line).toContain('title: attribute the model');
  });

  it('falls back to the PROFILES default when no override is present', () => {
    // Arrange
    const issue = { id: '1', title: 'no override', branch: 'b-1' };

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
    const issue = {
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
    const issue = {
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

  it('omits the effort separator when effort is unset', () => {
    expect(formatProfile({ model: 'claude-sonnet-5' })).toBe('claude-sonnet-5');
  });

  it('includes the effort separator when effort is set', () => {
    expect(formatProfile({ model: 'claude-sonnet-5', effort: 'low' })).toBe(
      'claude-sonnet-5·low',
    );
  });
});
