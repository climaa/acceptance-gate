import { parsePlan } from '../sandcastle-plan-parse.mts';
import { parseIssueIdFromBranch } from '../sandcastle-git-parse.mts';

/**
 * REAL unit tests for the trust boundary between planner output and the host
 * shell. parsePlan is the only sanctioned construction site for
 * planner-derived IssueRefs; every `id`/`branch` it returns is interpolated
 * into host `execSync`/`gh` commands, so the gate must reject anything outside
 * the documented grammar and reject the WHOLE plan on any violation.
 */

const good = (over: Record<string, unknown> = {}) => ({
  id: '42',
  title: 'Fix auth bug',
  branch: 'sandcastle/issue-42-fix-auth-bug',
  ...over,
});
const plan = (...issues: unknown[]) => JSON.stringify({ issues });

describe('parsePlan — happy path', () => {
  it('accepts the documented shape and returns fresh IssueRefs', () => {
    // Arrange
    const raw = plan(good());

    // Act
    const issues = parsePlan(raw);

    // Assert
    expect(issues).toEqual([
      { id: '42', title: 'Fix auth bug', branch: 'sandcastle/issue-42-fix-auth-bug' },
    ]);
  });

  it('accepts multi-digit ids and hyphenated slugs', () => {
    // Arrange & Act
    const issues = parsePlan(
      plan(good({ id: '475', branch: 'sandcastle/issue-475-readme-tidy-up' })),
    );

    // Assert
    expect(issues[0]?.id).toBe('475');
  });

  it('accepts an empty issue list', () => {
    // Arrange & Act & Assert
    expect(parsePlan(plan())).toEqual([]);
  });

  it('strips extra keys — a planner-forged `overrides` cannot survive', () => {
    // Arrange — overrides must come from vetted sc:* labels, never planner JSON.
    const raw = plan(good({ overrides: { implementer: { model: 'evil' } } }));

    // Act
    const issues = parsePlan(raw);

    // Assert — the returned object has exactly the three validated fields.
    expect(Object.keys(issues[0]!).sort()).toEqual(['branch', 'id', 'title']);
    expect('overrides' in issues[0]!).toBe(false);
  });
});

describe('parsePlan — injection payloads are rejected', () => {
  it('rejects a command-substitution branch that the OLD prefix regex allowed', () => {
    // Arrange — this is the exact bug: `sandcastle/issue-1-$(...)` is a legal
    // git branch that the prefix-only regex passed straight into execSync.
    const raw = plan(good({ id: '1', branch: 'sandcastle/issue-1-$(touch pwned)' }));

    // Act & Assert
    expect(() => parsePlan(raw)).toThrow(/invalid branch/);
  });

  it('rejects branch metacharacters and whitespace', () => {
    // Arrange & Act & Assert
    for (const branch of [
      'sandcastle/issue-42-a b',
      'sandcastle/issue-42-a;rm -rf /',
      'sandcastle/issue-42-a|b',
      'sandcastle/issue-42-a&b',
      'sandcastle/issue-42-`id`',
      "sandcastle/issue-42-a'b",
      'sandcastle/issue-42-', // empty slug
      'main',
    ]) {
      expect(() => parsePlan(plan(good({ branch })))).toThrow(/invalid branch/);
    }
  });

  it('rejects ids that are not bare digits', () => {
    // Arrange & Act & Assert
    for (const id of ['42;rm -rf /', '42 ', '', '1e3', '-1', 'abc']) {
      expect(() => parsePlan(plan(good({ id })))).toThrow(/invalid id/);
    }
  });

  it('rejects a cross-field mismatch: id 42 with someone else`s branch', () => {
    // Arrange
    const raw = plan(good({ id: '42', branch: 'sandcastle/issue-7-other' }));

    // Act & Assert — branch grammar passes, but it does not embed id 42.
    expect(() => parsePlan(raw)).toThrow(/does not embed id 42/);
  });
});

describe('parsePlan — whole-plan rejection and structure', () => {
  it('rejects the ENTIRE plan when one of three entries is invalid', () => {
    // Arrange — two valid, one poisoned.
    const raw = plan(
      good({ id: '1', branch: 'sandcastle/issue-1-a' }),
      good({ id: '2', branch: 'sandcastle/issue-2-$(x)' }),
      good({ id: '3', branch: 'sandcastle/issue-3-c' }),
    );

    // Act & Assert — no partial acceptance; the message names the offender.
    expect(() => parsePlan(raw)).toThrow(/issues\[1\]/);
  });

  it('rejects duplicate ids and duplicate branches', () => {
    // Arrange & Act & Assert
    expect(() =>
      parsePlan(
        plan(
          good({ id: '5', branch: 'sandcastle/issue-5-a' }),
          good({ id: '5', branch: 'sandcastle/issue-5-b' }),
        ),
      ),
    ).toThrow(/duplicate id/);
  });

  it('rejects structural garbage', () => {
    // Arrange & Act & Assert
    expect(() => parsePlan('not json')).toThrow(/did not parse/);
    expect(() => parsePlan(JSON.stringify({ issues: 'nope' }))).toThrow(
      /`issues` must be an array/,
    );
    expect(() => parsePlan(JSON.stringify([]))).toThrow(/must be an object/);
    expect(() => parsePlan(plan(null))).toThrow(/not an object/);
    expect(() => parsePlan(plan({ id: '1', branch: 'sandcastle/issue-1-a' }))).toThrow(
      /missing or empty title/,
    );
  });
});

describe('parsePlan / parseIssueIdFromBranch — single source of truth', () => {
  it('every branch the gate accepts is parsed to the same id', () => {
    // Arrange & Act & Assert — no drift between the validation regex and the
    // extraction used on the stranded-rescue path.
    const issues = parsePlan(
      plan(
        good({ id: '1', branch: 'sandcastle/issue-1-alpha' }),
        good({ id: '23', branch: 'sandcastle/issue-23-beta-gamma' }),
      ),
    );
    for (const issue of issues) {
      expect(parseIssueIdFromBranch(issue.branch)).toBe(issue.id);
    }
  });
});
