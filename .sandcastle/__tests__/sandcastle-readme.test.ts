import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const README = path.join(ROOT, ".sandcastle/README.md");

describe(".sandcastle/README.md", () => {
  let content: string;

  beforeAll(() => {
    content = fs.readFileSync(README, "utf8");
  });

  it("exists", () => {
    expect(fs.existsSync(README)).toBe(true);
  });

  it("documents how to run sandcastle (pnpm sandcastle / npx tsx)", () => {
    expect(content).toMatch(/pnpm sandcastle/);
    expect(content).toMatch(/npx tsx .sandcastle\/main\.mts/);
  });

  it("documents the completion-signal convention", () => {
    expect(content).toMatch(/<promise>COMPLETE<\/promise>/);
  });

  it("documents the run_in_background prohibition", () => {
    expect(content).toMatch(/run_in_background/);
  });

  it("documents the branch-name format", () => {
    expect(content).toMatch(/sandcastle\/issue-\{id\}/i);
  });

  it("documents required env vars (CLAUDE_CODE_OAUTH_TOKEN and GH_TOKEN)", () => {
    expect(content).toMatch(/CLAUDE_CODE_OAUTH_TOKEN/);
    expect(content).toMatch(/GH_TOKEN/);
  });

  it("documents gitignored paths (logs/ and worktrees/)", () => {
    expect(content).toMatch(/logs\//);
    expect(content).toMatch(/worktrees\//);
  });

  it("documents CODING_STANDARDS.md role", () => {
    expect(content).toMatch(/CODING_STANDARDS\.md/);
  });

  it("links to prior relevant PRs or issues", () => {
    // Must link at least two of the four referenced issues/PRs (#345, #420, #448, #468)
    const refs = ["#345", "#420", "#448", "#468"].filter((r) =>
      content.includes(r),
    );
    expect(refs.length).toBeGreaterThanOrEqual(2);
  });

  it("is within reasonable length (80–200 lines)", () => {
    const lines = content.split("\n").length;
    expect(lines).toBeGreaterThanOrEqual(80);
    expect(lines).toBeLessThanOrEqual(200);
  });
});
