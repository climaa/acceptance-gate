import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const SANDCASTLE = path.join(ROOT, ".sandcastle");

function read(file: string) {
  return fs.readFileSync(path.join(SANDCASTLE, file), "utf8");
}

describe("sandcastle orchestrator log serial", () => {
  const content = read("main.mts");

  // Locate the planner-summary console.log so assertions are scoped to it.
  const plannerLogMatch = content.match(
    /console\.log\(\s*`Planning complete\.[^`]*`[^)]*\)/s,
  );

  it("planner-summary log exists in main.mts", () => {
    expect(plannerLogMatch).not.toBeNull();
  });

  it("planner-summary log does not contain the word 'parallel'", () => {
    expect(plannerLogMatch![0]).not.toMatch(/parallel/i);
  });

  it("planner-summary log mentions serial execution", () => {
    expect(plannerLogMatch![0]).toMatch(/serial/i);
  });

  it("planner-summary log mentions pnpm 10.x deadlock reason", () => {
    expect(plannerLogMatch![0]).toMatch(/pnpm 10/i);
  });

  it("serial for-loop is preserved (issues awaited one by one)", () => {
    expect(content).toMatch(/for \(const issue of issues\)/);
    // The await must appear inside the for-loop body
    const forLoopIdx = content.indexOf("for (const issue of issues)");
    const awaitRunIssueIdx = content.indexOf(
      "await runIssue(issue, abortSignal)",
      forLoopIdx,
    );
    expect(awaitRunIssueIdx).toBeGreaterThan(forLoopIdx);
  });
});
