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
