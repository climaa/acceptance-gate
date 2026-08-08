import {
  classifyIssueViewFailure,
  classifyRevListFailure,
} from '../sandcastle-git-probe.mts';
import { read } from './helpers';

/**
 * REAL unit tests for the git/gh failure classifier.
 *
 * The whole point of the absent/error split is that a transient failure must
 * NOT be read as a benign "nothing there": an error misread as absent routes a
 * real run into markIssueNoOp (durable mislabel) or drops an issue's sc:* model
 * overrides. These pin the classification against the actual message strings
 * git and gh emit, and — critically — that the DEFAULT is error, so an
 * unrecognised message fails closed (loud) rather than open (silent).
 */

describe('classifyRevListFailure', () => {
  it('reads git\'s "unknown revision" family as absent (branch not created yet)', () => {
    // Arrange & Act & Assert
    expect(
      classifyRevListFailure(
        "fatal: ambiguous argument 'origin/main..sandcastle/issue-1-x': " +
          'unknown revision or path not in the working tree.',
      ),
    ).toBe('absent');
    expect(classifyRevListFailure("fatal: bad revision 'origin/main..x'")).toBe('absent');
  });

  it('reads a broken environment or network failure as a real error', () => {
    // Arrange & Act & Assert — these must never be read as "0 commits ahead".
    expect(
      classifyRevListFailure(
        'fatal: not a git repository (or any of the parent directories): .git',
      ),
    ).toBe('error');
    expect(
      classifyRevListFailure(
        "fatal: unable to access 'https://…': Could not resolve host: github.com",
      ),
    ).toBe('error');
  });

  it('fails closed: an empty or unrecognised stderr is an error, not absent', () => {
    // Arrange & Act & Assert
    expect(classifyRevListFailure('')).toBe('error');
    expect(classifyRevListFailure('something we have never seen')).toBe('error');
  });
});

describe('classifyIssueViewFailure', () => {
  it('reads gh\'s "could not resolve to an Issue" as absent', () => {
    // Arrange & Act & Assert
    expect(
      classifyIssueViewFailure(
        'GraphQL: Could not resolve to an Issue with the number of 999. (repository.issue)',
      ),
    ).toBe('absent');
  });

  it('reads auth / network / rate-limit failures as real errors', () => {
    // Arrange & Act & Assert — a run must not treat these as "issue has no labels".
    expect(
      classifyIssueViewFailure(
        'gh: To use GitHub CLI in automation, set the GH_TOKEN environment variable.',
      ),
    ).toBe('error');
    expect(classifyIssueViewFailure('API rate limit exceeded for user')).toBe('error');
    expect(classifyIssueViewFailure('error connecting to api.github.com')).toBe('error');
  });

  it('fails closed: an empty or unrecognised stderr is an error', () => {
    // Arrange & Act & Assert
    expect(classifyIssueViewFailure('')).toBe('error');
    expect(classifyIssueViewFailure('gremlins')).toBe('error');
  });
});

describe('main.mts wiring (source-text — the loop is not unit-testable yet)', () => {
  const main = read('main.mts');

  it('resolves override labels through probeIssue and throws on a gh error', () => {
    // The eligibility pass must fail loud on a transient gh error rather than
    // run the issue on default models with its sc:* overrides dropped (F9).
    expect(main).toMatch(/probeIssue\(issue\.id\)/);
    expect(main).toMatch(/issueProbe\.kind === 'error'[\s\S]*?throw new Error/);
  });

  it('files an unverifiable branch as failed, never branchAhead=false', () => {
    // A transient git error at the partition site must not mark a real run
    // no-op and durably label it (F9).
    expect(main).toMatch(/probeBranchCommitsAhead\(issue\.branch\)/);
    expect(main).toMatch(/ahead\.kind === 'error'[\s\S]*?status: 'rejected' as const/);
  });
});
