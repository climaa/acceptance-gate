import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../..");
const SANDCASTLE = path.join(ROOT, ".sandcastle");

function read(file: string) {
  return fs.readFileSync(path.join(SANDCASTLE, file), "utf8");
}

describe("sandcastle orchestrator fixes (issue #345)", () => {
  describe("Bug 1 — main.mts always forks from origin/main", () => {
    const configContent = read("sandcastle-config.mts");
    const runIssueContent = read("sandcastle-run-issue.mts");
    const strandedBranchesContent = read("sandcastle-stranded-branches.mts");

    // main.mts was refactored to parameterize the base ref as `BASE_BRANCH`
    // (PR #1340, "align git base-ref"), so the literal "main" became
    // `${BASE_BRANCH}`. Pin the constant's value here so the "always forks from
    // origin/main" contract stays guarded, then assert the fetch/baseBranch
    // use that variable.
    it("pins BASE_BRANCH to main", () => {
      expect(configContent).toMatch(/const BASE_BRANCH\s*=\s*["']main["']/);
    });

    it("fetches origin/${BASE_BRANCH} before creating a sandbox — both call sites", () => {
      // The per-issue pipeline (sandcastle-run-issue.mts) and the
      // stranded-branch rescue path (sandcastle-stranded-branches.mts) each
      // create their own sandbox — both must fetch first.
      expect(runIssueContent).toMatch(/git fetch origin \$\{BASE_BRANCH\}/);
      expect(strandedBranchesContent).toMatch(
        /git fetch origin \$\{BASE_BRANCH\}/,
      );
    });

    it("passes baseBranch: `origin/${BASE_BRANCH}` to createSandbox — both call sites", () => {
      expect(runIssueContent).toMatch(
        /baseBranch:\s*`origin\/\$\{BASE_BRANCH\}`/,
      );
      expect(strandedBranchesContent).toMatch(
        /baseBranch:\s*`origin\/\$\{BASE_BRANCH\}`/,
      );
    });

    it("fetch occurs inside runIssue before createSandbox", () => {
      const runIssueStart = runIssueContent.indexOf(
        "export async function runIssue",
      );
      const fetchIdx = runIssueContent.indexOf(
        "git fetch origin ${BASE_BRANCH}",
        runIssueStart,
      );
      const createSandboxIdx = runIssueContent.indexOf(
        "sandcastle.createSandbox(",
        runIssueStart,
      );
      expect(runIssueStart).toBeGreaterThan(-1);
      expect(fetchIdx).toBeGreaterThan(runIssueStart);
      expect(createSandboxIdx).toBeGreaterThan(fetchIdx);
    });
  });

  describe("Bug 3 — main.mts passes issue context to reviewer", () => {
    const content = read("sandcastle-run-issue.mts");
    const reviewerBlock = content.slice(
      content.indexOf('name: "reviewer"'),
      content.indexOf('name: "reviewer"') + 500,
    );

    it("does not pass SOURCE_BRANCH in reviewer promptArgs (auto-injected by SDK via baseBranch)", () => {
      expect(reviewerBlock).not.toMatch(/SOURCE_BRANCH/);
    });

    it("passes TASK_ID to reviewer promptArgs", () => {
      expect(reviewerBlock).toMatch(/TASK_ID/);
    });

    it("passes ISSUE_TITLE to reviewer promptArgs", () => {
      expect(reviewerBlock).toMatch(/ISSUE_TITLE/);
    });
  });

  describe("Bug 2 — implement-prompt.md fast-path requires relevance evidence", () => {
    const content = read("agent-docs/implement-prompt.md");

    it("checks merge-base against origin/main", () => {
      expect(content).toMatch(/git merge-base HEAD origin\/main/);
      expect(content).toMatch(/git rev-parse origin\/main/);
    });

    it("checks commit messages for issue reference before fast-pathing", () => {
      expect(content).toMatch(/git log main\.\.HEAD --oneline/);
    });

    it("references TASK_ID in the commit relevance check", () => {
      expect(content).toMatch(/#\{\{TASK_ID\}\}/);
    });

    it("references ISSUE_TITLE in the commit relevance check", () => {
      expect(content).toMatch(
        /ISSUE_TITLE.*case-insensitive|case-insensitive.*ISSUE_TITLE|\{\{ISSUE_TITLE\}\}/,
      );
    });

    it("does not fast-path on count alone — zero check comes first", () => {
      const zeroIdx = content.indexOf("number is **0**");
      const positiveIdx = content.indexOf("number is **greater than 0**");
      expect(zeroIdx).toBeGreaterThan(-1);
      expect(positiveIdx).toBeGreaterThan(-1);
      // "0" branch (proceed) must appear before "> 0" branch (check + maybe complete)
      expect(zeroIdx).toBeLessThan(positiveIdx);
    });

    it("comments on the issue when merge-base is wrong", () => {
      expect(content).toMatch(
        /gh issue comment.*TASK_ID.*wrong base|wrong base.*gh issue comment/s,
      );
    });
  });

  describe("Issue #448 — completionSignal wired to all three runs that emit <promise>COMPLETE</promise>", () => {
    const mergeContent = read("sandcastle-merge.mts");
    const runIssueContent = read("sandcastle-run-issue.mts");

    // Slice to the end of the sandcastle.run({...}) call rather than a fixed
    // width — comments added inside the call (e.g. #1672's sandbox env guard)
    // must not push the asserted options out of the window.
    const mergerStart = mergeContent.indexOf("export async function runMerger");
    const mergerBlock = mergeContent.slice(
      mergerStart,
      mergeContent.indexOf("});", mergerStart) + 3,
    );

    const implementerStart = runIssueContent.indexOf('name: "implementer"');
    const implementerBlock = runIssueContent.slice(
      implementerStart,
      implementerStart + 400,
    );

    const reviewerStart = runIssueContent.indexOf('name: "reviewer"');
    const reviewerBlock = runIssueContent.slice(
      reviewerStart,
      reviewerStart + 400,
    );

    it("merger sandcastle.run includes completionSignal", () => {
      expect(mergerBlock).toMatch(/completionSignal/);
    });

    it("merger completionSignal value is the promise sentinel", () => {
      expect(mergerBlock).toMatch(/<promise>COMPLETE<\/promise>/);
    });

    it("implementer sandbox.run includes completionSignal", () => {
      expect(implementerBlock).toMatch(/completionSignal/);
    });

    it("implementer completionSignal value is the promise sentinel", () => {
      expect(implementerBlock).toMatch(/<promise>COMPLETE<\/promise>/);
    });

    it("reviewer sandbox.run includes completionSignal", () => {
      expect(reviewerBlock).toMatch(/completionSignal/);
    });

    it("reviewer completionSignal value is the promise sentinel", () => {
      expect(reviewerBlock).toMatch(/<promise>COMPLETE<\/promise>/);
    });
  });

  describe("Bug 3 — review-prompt.md scope guard and edit constraint", () => {
    const content = read("agent-docs/review-prompt.md");

    it("has a SCOPE GUARD section", () => {
      expect(content).toMatch(/SCOPE GUARD/i);
    });

    it("runs git diff --name-only to assess relevance", () => {
      expect(content).toMatch(/git diff.*--name-only/);
    });

    it("comments on the issue when no relevant work found", () => {
      expect(content).toMatch(
        /gh issue comment.*TASK_ID|TASK_ID.*gh issue comment/s,
      );
      expect(content).toMatch(/relevant work/i);
    });

    it("constrains reviewer to files in the implementer diff", () => {
      expect(content).toMatch(
        /constrain.*edits.*diff|only.*files.*diff|diff.*files.*touch/is,
      );
    });

    it("uses TASK_ID placeholder", () => {
      expect(content).toMatch(/\{\{TASK_ID\}\}/);
    });

    it("uses ISSUE_TITLE placeholder", () => {
      expect(content).toMatch(/\{\{ISSUE_TITLE\}\}/);
    });

    it("hardcodes origin/main (not {{SOURCE_BRANCH}}) in git diff commands", () => {
      expect(content).toMatch(/origin\/main/);
      expect(content).not.toMatch(/origin\/\{\{SOURCE_BRANCH\}\}/);
    });

    it("scope guard appears before review process section", () => {
      const guardIdx = content.indexOf("SCOPE GUARD");
      const reviewIdx = content.indexOf("REVIEW PROCESS");
      expect(guardIdx).toBeGreaterThan(-1);
      expect(reviewIdx).toBeGreaterThan(-1);
      expect(guardIdx).toBeLessThan(reviewIdx);
    });
  });
});
