import { read } from './helpers';

// the host already pushes every completed branch to origin before the merger
// runs (main.mts [ci-trigger]), so the merger's own Step-1 push is usually a
// no-op. On 2026-07-25 the batch produced zero PRs for ten fully-implemented,
// already-pushed branches (a stale-image pnpm mismatch surfaced as phantom
// failures). The fix: skip the push when the branch is already published, so
// gh pr create is never gated on a redundant push.
describe('sandcastle merge-prompt skip no-op push', () => {
  const content = read('agent-docs/merge-prompt.md');

  it('checks divergence via git rev-list --left-right --count before pushing', () => {
    expect(content).toMatch(/git rev-list --left-right --count/);
  });

  it('compares the local branch against its origin tracking ref', () => {
    // e.g. <branch>...origin/<branch>
    expect(content).toMatch(/\.\.\.origin\//);
  });

  it('skips the push entirely when the branch is already published (0\\t0)', () => {
    expect(content).toMatch(/0\\t0|`0\s+0`|0\t0/);
    expect(content).toMatch(/skip.*push|already published|nothing to push/i);
  });

  it('only pushes when there is something to push', () => {
    expect(content).toMatch(
      /[Oo]nly push when there is something to push|only when there is something to push/,
    );
  });

  it('requires checking out the branch before pushing (secondary bug)', () => {
    expect(content).toMatch(/git checkout <branch>|git switch <branch>/);
    expect(content).toMatch(
      /check(ing)? ?out.*before.*push|check(ing)? ?out the branch/i,
    );
  });

  it('still fetches origin so the tracking ref is current before comparing', () => {
    expect(content).toMatch(/git fetch origin/);
  });

  it('retains the no --no-verify prohibition and gh pr create path', () => {
    expect(content).toMatch(/--no-verify/);
    expect(content).toMatch(/gh pr create/);
  });
});
