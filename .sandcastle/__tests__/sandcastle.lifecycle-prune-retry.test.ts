import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const SANDCASTLE = path.join(ROOT, ".sandcastle");

function read(file: string) {
  return fs.readFileSync(path.join(SANDCASTLE, file), "utf8");
}

describe("sandcastle lifecycle prune + retry (issue #729)", () => {
  // Fix A (the call site: worktree prune before createSandbox, wrapped in
  // withRetry) now lives in sandcastle-run-issue.mts. Fix B (withRetry's own
  // definition — attempt count, backoff delay, warning text) lives in
  // sandcastle-lifecycle.mts.
  const runIssueContent = read("sandcastle-run-issue.mts");
  const lifecycleContent = read("sandcastle-lifecycle.mts");

  const runIssueStart = runIssueContent.indexOf(
    "export async function runIssue",
  );
  // runIssue is the only exported function in this file — slice to the end.
  const runIssueBody = runIssueContent.slice(runIssueStart);

  describe("Fix A — git worktree prune before createSandbox", () => {
    it("runIssue calls git worktree prune", () => {
      expect(runIssueBody).toMatch(/git worktree prune/);
    });

    it("worktree prune occurs before createSandbox", () => {
      const pruneIdx = runIssueBody.indexOf("git worktree prune");
      const createIdx = runIssueBody.indexOf("sandcastle.createSandbox(");
      expect(pruneIdx).toBeGreaterThan(-1);
      expect(createIdx).toBeGreaterThan(-1);
      expect(pruneIdx).toBeLessThan(createIdx);
    });

    it("worktree prune uses execSync with stdio inherit or pipe (not fire-and-forget)", () => {
      // The prune call must be synchronous so it completes before createSandbox starts
      const pruneIdx = runIssueContent.indexOf("git worktree prune");
      const pruneContext = runIssueContent.slice(pruneIdx - 30, pruneIdx + 100);
      expect(pruneContext).toMatch(/execSync/);
    });
  });

  describe("Fix B — createSandbox retry with backoff", () => {
    it("a retry helper or loop wraps createSandbox", () => {
      // Accept any retry pattern: a named helper fn, a for/while loop with catch,
      // or an inline attempt counter
      const hasRetryHelper =
        runIssueBody.includes("withRetry") ||
        runIssueBody.includes("retryCreateSandbox") ||
        /for\s*\(.*attempt.*<.*\d/.test(runIssueBody) ||
        /let attempt/.test(runIssueBody);
      expect(hasRetryHelper).toBe(true);
    });

    it("retry allows at least 2 attempts", () => {
      // The retry count / maxAttempts must be >= 2
      const twoOrMore =
        /maxAttempts.*[2-9]|retries.*[1-9]|attempt.*<.*[2-9]|withRetry\([^,)]+,\s*[2-9]/.test(
          lifecycleContent,
        );
      expect(twoOrMore).toBe(true);
    });

    it("retry introduces a delay between attempts of at least 2000ms", () => {
      // Look for setTimeout or sleep with a value >= 2000
      const hasDelay =
        /setTimeout[^)]*[2-9]\d{3}/.test(lifecycleContent) ||
        /delay.*[2-9]\d{3}|[2-9]\d{3}.*delay/.test(lifecycleContent) ||
        /withRetry\([^)]*,\s*\d+\s*,\s*[2-9]\d{3}/.test(lifecycleContent);
      expect(hasDelay).toBe(true);
    });

    it("retry logs a warning on each failed attempt before retrying", () => {
      // Must warn the operator so the failure is observable in the orchestrator log
      const hasWarn =
        lifecycleContent.includes("console.warn") &&
        (lifecycleContent.includes("attempt") ||
          lifecycleContent.includes("retry"));
      expect(hasWarn).toBe(true);
    });
  });
});
