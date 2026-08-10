// Classify a failed git/gh probe as "the thing genuinely isn't there" (absent)
// versus "the query itself failed" (error).
//
// Before this, sandcastle-git.mts collapsed both into one sentinel: a failed
// `git rev-list --count` returned false whether the branch did not exist yet
// (absent — benign) or git errored transiently, and a failed `gh issue view`
// returned null whether the issue was gone (absent) or gh hit a network/auth/
// rate-limit blip. That conflation is F9: a transient error during a real run
// could route work into markIssueNoOp (durably labelling an issue that was
// never a no-op) or silently drop an issue's sc:* model overrides.
//
// Pure: the shelling-out stays in sandcastle-git.mts as a thin IO wrapper; only
// the stderr classification lives here, where it is unit-tested against real
// message fixtures. Imports nothing, so loading it drags in no side effects.

export type GitProbe<T> =
  { kind: 'ok'; value: T } | { kind: 'absent' } | { kind: 'error'; stderr: string };

/**
 * `git rev-list --count <base>..<branch>` reports a missing ref with git's
 * "unknown revision" family (`fatal: ambiguous argument '…': unknown revision
 * or path not in the working tree`). Everything else — no repo, permission
 * denied, a broken git binary — is a real error we must NOT read as "0 ahead".
 */
export function classifyRevListFailure(stderr: string): 'absent' | 'error' {
  return /unknown revision|ambiguous argument|bad revision/i.test(stderr)
    ? 'absent'
    : 'error';
}

/**
 * `gh issue view <id>` reports a missing (or deleted) issue with
 * "Could not resolve to an Issue". Auth, network, and rate-limit failures are
 * real errors — a run must not treat them as "issue has no labels".
 */
export function classifyIssueViewFailure(stderr: string): 'absent' | 'error' {
  return /could not resolve to an? issue/i.test(stderr) ? 'absent' : 'error';
}

/**
 * Whether a git/gh failure is worth retrying. The SSL handshake failure this
 * repo actually saw during worktree setup —
 * `LibreSSL SSL_connect: SSL_ERROR_SYSCALL in connection to github.com:443` —
 * succeeded on retry within seconds every time, and the same is true of the
 * network-blip family it belongs to (DNS, connection reset/timeout, the
 * remote hanging up mid-handshake).
 *
 * Deliberately a blocklist, not an allowlist: authentication failures, a
 * missing remote (404), and a rejected push are permanent — retrying them
 * only burns the backoff budget on something that will never succeed on its
 * own. Anything else defaults to retryable, including failure text this
 * function has never seen, because an allowlist of exact transient strings
 * would silently stop retrying the next new transient failure shape.
 */
export function isRetryableGitError(message: string): boolean {
  return !/authentication failed|permission denied|403\b|not found|404|could not resolve to a|\[rejected\]|failed to push some refs|non-fast-forward|remote rejected/i.test(
    message,
  );
}
