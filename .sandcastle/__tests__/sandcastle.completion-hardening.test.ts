import { read } from './helpers';

describe('sandcastle completion hardening ', () => {
  describe('all three prompt files — very-last-output requirement', () => {
    const FILES = [
      'agent-docs/implement-prompt.md',
      'agent-docs/review-prompt.md',
      'agent-docs/merge-prompt.md',
    ];

    it.each(FILES)(
      '%s requires the completion token to be the very last output',
      (file) => {
        const content = read(file);
        expect(content).toMatch(/very last/i);
      },
    );

    it.each(FILES)('%s explicitly prohibits trailing prose after the token', (file) => {
      const content = read(file);
      expect(content).toMatch(
        /do not write.*after.*token|no.*prose.*after|no.*text.*after|no.*summary.*after/i,
      );
    });
  });

  describe('sandcastle-run-issue.mts — idle-timeout salvage for implementer', () => {
    const content = read('sandcastle-run-issue.mts');
    const runIssueStart = content.indexOf('export async function runIssue');
    const runIssueBody = content.slice(runIssueStart, runIssueStart + 3000);

    it('runIssue contains a .catch() on the implementer sandbox.run call', () => {
      expect(runIssueBody).toMatch(/\.catch\(/);
    });

    it('.catch() block checks branchHasCommitsAhead before salvaging', () => {
      const catchIdx = runIssueBody.indexOf('.catch(');
      const catchBody = runIssueBody.slice(catchIdx, catchIdx + 500);
      expect(catchBody).toMatch(/branchHasCommitsAhead/);
    });

    it('salvage path logs a warning about salvaging committed work', () => {
      expect(runIssueBody).toMatch(/salvag/i);
    });
  });
});
