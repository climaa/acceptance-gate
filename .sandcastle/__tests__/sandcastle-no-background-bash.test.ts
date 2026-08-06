import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const PROMPTS = [
  ".sandcastle/agent-docs/merge-prompt.md",
  ".sandcastle/agent-docs/implement-prompt.md",
  ".sandcastle/agent-docs/review-prompt.md",
];

describe("sandcastle prompt files forbid run_in_background bash calls", () => {
  it.each(PROMPTS)("%s exists", (relPath) => {
    expect(fs.existsSync(path.join(ROOT, relPath))).toBe(true);
  });

  it.each(PROMPTS)("%s contains run_in_background prohibition", (relPath) => {
    const content = fs.readFileSync(path.join(ROOT, relPath), "utf8");
    expect(content).toMatch(/run_in_background.*true/);
  });

  it.each(PROMPTS)(
    "%s explains why (signal detector / background handles)",
    (relPath) => {
      const content = fs.readFileSync(path.join(ROOT, relPath), "utf8");
      expect(content).toMatch(/completion-signal detector|background handle/i);
    },
  );
});
