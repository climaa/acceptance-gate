import {
  classifyIssueViewFailure,
  classifyRevListFailure,
  isRetryableGitError,
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

describe('isRetryableGitError', () => {
  it('treats the SSL handshake failure this repo has seen as retryable', () => {
    // Arrange & Act & Assert — the exact message observed:
    // "fatal: unable to access '…': LibreSSL SSL_connect: SSL_ERROR_SYSCALL
    // in connection to github.com:443", which succeeded on retry every time.
    expect(
      isRetryableGitError(
        "fatal: unable to access 'https://github.com/climaa/acceptance-gate.git/': " +
          'LibreSSL SSL_connect: SSL_ERROR_SYSCALL in connection to github.com:443',
      ),
    ).toBe(true);
  });

  it('treats DNS and connection-reset failures as retryable', () => {
    // Arrange & Act & Assert — the same network-blip family.
    expect(isRetryableGitError('Could not resolve host: github.com')).toBe(true);
    expect(isRetryableGitError('Connection reset by peer')).toBe(true);
  });

  it('does not retry an authentication failure', () => {
    // Arrange & Act & Assert
    expect(
      isRetryableGitError(
        "fatal: Authentication failed for 'https://github.com/climaa/acceptance-gate.git/'",
      ),
    ).toBe(false);
  });

  it('does not retry a 404 (missing remote/repo)', () => {
    // Arrange & Act & Assert
    expect(
      isRetryableGitError("fatal: repository 'https://github.com/x/y.git/' not found"),
    ).toBe(false);
  });

  it('does not retry a rejected push', () => {
    // Arrange & Act & Assert
    expect(
      isRetryableGitError(
        '! [rejected]        main -> main (non-fast-forward)\n' +
          "error: failed to push some refs to 'https://github.com/x/y.git'",
      ),
    ).toBe(false);
  });

  it('defaults an unrecognised message to retryable (fails open, toward availability)', () => {
    // Arrange & Act & Assert — unlike the absent/error classifiers above,
    // which fail closed toward loudness, an unclassified setup failure should
    // still get its bounded retry budget rather than fail fast on a guess.
    expect(isRetryableGitError('something we have never seen')).toBe(true);
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

  it('prints the end-of-iteration unresolved-issue summary', () => {
    // The safety net: a planned issue that failed or was never attempted must
    // be named, not just folded into the generic per-outcome logging above.
    expect(main).toMatch(/formatUnresolvedSummary/);
    expect(main).toMatch(/notAttempted/);
  });

  it('files an unverifiable branch as failed, never branchAhead=false', () => {
    // A transient git error at the partition site must not mark a real run
    // no-op and durably label it (F9).
    expect(main).toMatch(/probeBranchCommitsAhead\(issue\.branch\)/);
    expect(main).toMatch(/ahead\.kind === 'error'[\s\S]*?status: 'rejected' as const/);
  });
});
