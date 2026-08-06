import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const SANDCASTLE = path.join(ROOT, ".sandcastle");

function read(file: string) {
  return fs.readFileSync(path.join(SANDCASTLE, file), "utf8");
}

const mainContent = read("main.mts");
const buildVerifyContent = read("sandcastle-build-verify.mts");
const runIssueContent = read("sandcastle-run-issue.mts");
const strandedBranchesContent = read("sandcastle-stranded-branches.mts");

// The build-verify command/log lines are spread across main.mts and the
// modules that call runBuildVerify() — concatenate them so a "does it appear
// anywhere" check covers every real call site, not just one.
const allBuildRelatedContent =
  mainContent + buildVerifyContent + runIssueContent + strandedBranchesContent;

describe("sandcastle build script rename: build:all → build", () => {
  it("no build-verify code invokes pnpm build:all anywhere", () => {
    expect(allBuildRelatedContent).not.toMatch(/pnpm build:all/);
  });

  it("BUILD_VERIFY_COMMAND runs pnpm build", () => {
    const commandMatch = buildVerifyContent.match(
      /const BUILD_VERIFY_COMMAND\s*=\s*"[^"]*"\s*;/,
    );
    expect(commandMatch).not.toBeNull();
    expect(commandMatch![0]).toMatch(/pnpm build/);
    expect(commandMatch![0]).not.toMatch(/pnpm build:all/);
  });

  it("[build-verify] log line references pnpm build, not pnpm build:all — both call sites", () => {
    // "running pnpm build" appears at two sites: the per-issue pipeline
    // (sandcastle-run-issue.mts) and the stranded-branch rescue path
    // (sandcastle-stranded-branches.mts) — check both, not just one.
    expect(runIssueContent).toMatch(/running pnpm build /);
    expect(runIssueContent).not.toMatch(/running pnpm build:all/);
    expect(strandedBranchesContent).toMatch(/running pnpm build /);
    expect(strandedBranchesContent).not.toMatch(/running pnpm build:all/);
  });

  it("failure message references pnpm build, not pnpm build:all", () => {
    expect(runIssueContent).toMatch(/pnpm build FAILED/);
    expect(runIssueContent).not.toMatch(/pnpm build:all FAILED/);
  });
});
