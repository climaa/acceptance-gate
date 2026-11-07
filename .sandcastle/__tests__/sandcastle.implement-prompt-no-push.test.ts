import { read } from './helpers';

// The sandbox cannot run the pre-push gate's e2e (its image has no browser), so
// an implementer push always failed there and the implementer spent its run
// diagnosing an environment red and filing a "not pushed" blocker. The commits
// already live in the host's bind-mounted repository; the host pushes them
// after the review, through the gate (#678).
describe('implement-prompt.md — the host pushes, not the implementer', () => {
  const content = read('agent-docs/implement-prompt.md');
  // The one line that may name `git push` is the --no-verify prohibition.
  const instructions = content
    .split('\n')
    .filter((line) => !line.includes('--no-verify'))
    .join('\n');

  it('never tells the implementer to git push', () => {
    // Arrange: the prompt with the --no-verify prohibition set aside
    // Act
    const pushes = instructions.match(/git push/g) ?? [];
    // Assert
    expect(pushes).toEqual([]);
  });

  it('says why: the sandbox cannot run e2e, and the commits already live on the host', () => {
    // Arrange
    const push = content.slice(
      content.indexOf('## PUSH'),
      content.indexOf('## THE ISSUE'),
    );
    // Act / Assert
    expect(push).toMatch(/do not push/i);
    expect(push).toMatch(/e2e/);
    expect(push).toMatch(/host/);
  });

  it('keeps pushing out of the issue comment unless the work is unfinished', () => {
    // Arrange
    const issue = content.slice(
      content.indexOf('## THE ISSUE'),
      content.indexOf('## FINAL RULES'),
    );
    // Act / Assert
    expect(issue).toMatch(/say nothing about pushing unless the work is unfinished/i);
    expect(issue).toMatch(/never a blocker/i);
  });
});
