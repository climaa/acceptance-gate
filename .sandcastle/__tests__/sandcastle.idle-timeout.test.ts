import { read } from './helpers';

describe('sandcastle idle-timeout budgets', () => {
  describe('explicit idleTimeoutSeconds on all four run calls', () => {
    // Split across the modules each call now lives in: the merger
    // (sandcastle-merge.mts), the implementer/reviewer (sandcastle-run-issue.mts),
    // and the planner (still inline in main.mts's loop).
    const mergeContent = read('sandcastle-merge.mts');
    const runIssueContent = read('sandcastle-run-issue.mts');
    const mainContent = read('main.mts');

    // Slice to the end of the sandcastle.run({...}) call rather than a fixed
    // width — comments added inside the call (e.g. the sandbox env guard)
    // must not push the asserted options out of the window.
    const mergerStart = mergeContent.indexOf('export async function runMerger');
    const mergerBlock = mergeContent.slice(
      mergerStart,
      mergeContent.indexOf('});', mergerStart) + 3,
    );

    const implementerStart = runIssueContent.indexOf('name: "implementer"');
    const implementerBlock = runIssueContent.slice(
      implementerStart,
      implementerStart + 400,
    );

    const reviewerStart = runIssueContent.indexOf('name: "reviewer"');
    const reviewerBlock = runIssueContent.slice(reviewerStart, reviewerStart + 400);

    const plannerStart = mainContent.indexOf('name: "planner"');
    const plannerBlock = mainContent.slice(plannerStart, plannerStart + 600);

    it('merger run has idleTimeoutSeconds: 1800', () => {
      expect(mergerBlock).toMatch(/idleTimeoutSeconds:\s*1800/);
    });

    it('implementer run has idleTimeoutSeconds: 1200', () => {
      expect(implementerBlock).toMatch(/idleTimeoutSeconds:\s*1200/);
    });

    it('reviewer run has idleTimeoutSeconds: 1200', () => {
      expect(reviewerBlock).toMatch(/idleTimeoutSeconds:\s*1200/);
    });

    it('planner run has idleTimeoutSeconds: 600', () => {
      expect(plannerBlock).toMatch(/idleTimeoutSeconds:\s*600/);
    });
  });

  describe('merge-prompt.md — poll loop emits output each iteration', () => {
    const content = read('agent-docs/merge-prompt.md');

    it('poll loop echoes state on each iteration so the SDK idle timer resets', () => {
      // The echo must appear inside the for-loop block (before the sleep)
      expect(content).toMatch(/echo.*poll.*\$i|echo.*state.*\$PR_STATE/i);
    });
  });

  describe('README.md — Completion-signal section documents per-phase timeout budgets', () => {
    const content = read('README.md');

    it('mentions idleTimeoutSeconds in the Completion-signal section', () => {
      const sectionStart = content.indexOf('## Completion-signal convention');
      expect(sectionStart).toBeGreaterThan(-1);
      const nextSection = content.indexOf('\n## ', sectionStart + 1);
      const section = content.slice(
        sectionStart,
        nextSection === -1 ? undefined : nextSection,
      );
      expect(section).toMatch(/idleTimeoutSeconds/);
    });

    it('mentions the merger timeout value (1800) in the README', () => {
      expect(content).toMatch(/1800/);
    });

    it('mentions the implementer/reviewer timeout value (1200) in the README', () => {
      expect(content).toMatch(/1200/);
    });
  });
});
