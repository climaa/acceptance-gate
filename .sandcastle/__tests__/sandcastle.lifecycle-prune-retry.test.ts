import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const SANDCASTLE = path.join(ROOT, '.sandcastle');

function read(file: string) {
  return fs.readFileSync(path.join(SANDCASTLE, file), 'utf8');
}

describe('sandcastle lifecycle prune + retry', () => {
  // Fix A (the call site: worktree prune before createSandbox, wrapped in
  // withRetry) now lives in the shared sandcastle-worktree-sandbox.mts helper,
  // consumed by both sandcastle-run-issue.mts and
  // sandcastle-stranded-branches.mts. Fix B (withRetry's own definition —
  // attempt count, backoff delay, warning text) lives in
  // sandcastle-lifecycle.mts.
  const worktreeSandboxContent = read('sandcastle-worktree-sandbox.mts');
  const lifecycleContent = read('sandcastle-lifecycle.mts');

  const helperStart = worktreeSandboxContent.indexOf(
    'export async function createWorktreeSandbox',
  );
  // createWorktreeSandbox is the only exported function in this file — slice to the end.
  const helperBody = worktreeSandboxContent.slice(helperStart);

  describe('Fix A — git worktree prune before createSandbox', () => {
    it('createWorktreeSandbox calls git worktree prune', () => {
      expect(helperBody).toMatch(/git worktree prune/);
    });

    it('worktree prune occurs before createSandbox', () => {
      const pruneIdx = helperBody.indexOf('git worktree prune');
      const createIdx = helperBody.indexOf('sandcastle.createSandbox(');
      expect(pruneIdx).toBeGreaterThan(-1);
      expect(createIdx).toBeGreaterThan(-1);
      expect(pruneIdx).toBeLessThan(createIdx);
    });

    it('worktree prune uses execSync with stdio inherit or pipe (not fire-and-forget)', () => {
      // The prune call must be synchronous so it completes before createSandbox starts
      const pruneIdx = worktreeSandboxContent.indexOf('git worktree prune');
      const pruneContext = worktreeSandboxContent.slice(pruneIdx - 30, pruneIdx + 100);
      expect(pruneContext).toMatch(/execSync/);
    });
  });

  describe('Fix B — createSandbox retry with backoff', () => {
    it('a retry helper or loop wraps createSandbox', () => {
      // Accept any retry pattern: a named helper fn, a for/while loop with catch,
      // or an inline attempt counter
      const hasRetryHelper =
        helperBody.includes('withRetry') ||
        helperBody.includes('retryCreateSandbox') ||
        /for\s*\(.*attempt.*<.*\d/.test(helperBody) ||
        /let attempt/.test(helperBody);
      expect(hasRetryHelper).toBe(true);
    });

    it('retry allows at least 2 attempts', () => {
      // The retry count / maxAttempts must be >= 2
      const twoOrMore =
        /maxAttempts.*[2-9]|retries.*[1-9]|attempt.*<.*[2-9]|withRetry\([^,)]+,\s*[2-9]/.test(
          lifecycleContent,
        );
      expect(twoOrMore).toBe(true);
    });

    it('retry introduces a delay between attempts of at least 2000ms', () => {
      // Look for setTimeout or sleep with a value >= 2000
      const hasDelay =
        /setTimeout[^)]*[2-9]\d{3}/.test(lifecycleContent) ||
        /delay.*[2-9]\d{3}|[2-9]\d{3}.*delay/.test(lifecycleContent) ||
        /withRetry\([^)]*,\s*\d+\s*,\s*[2-9]\d{3}/.test(lifecycleContent);
      expect(hasDelay).toBe(true);
    });

    it('retry logs a warning on each failed attempt before retrying', () => {
      // Must warn the operator so the failure is observable in the orchestrator log
      const hasWarn =
        lifecycleContent.includes('console.warn') &&
        (lifecycleContent.includes('attempt') || lifecycleContent.includes('retry'));
      expect(hasWarn).toBe(true);
    });
  });
});
