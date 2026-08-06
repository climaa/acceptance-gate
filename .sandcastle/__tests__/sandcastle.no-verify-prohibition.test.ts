import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const SANDCASTLE = path.join(ROOT, ".sandcastle");

function read(file: string) {
  return fs.readFileSync(path.join(SANDCASTLE, file), "utf8");
}

describe("sandcastle no-verify prohibition", () => {
  const standards = read("agent-docs/CODING_STANDARDS.md");
  const implementPrompt = read("agent-docs/implement-prompt.md");
  const mergePrompt = read("agent-docs/merge-prompt.md");

  describe("CODING_STANDARDS.md", () => {
    it("does not contain a permission carve-out for --no-verify", () => {
      expect(standards).not.toMatch(/without explicit instruction/i);
    });

    it("explicitly prohibits git commit --no-verify", () => {
      expect(standards).toMatch(/git commit --no-verify/);
    });

    it("explicitly prohibits git push --no-verify", () => {
      expect(standards).toMatch(/git push --no-verify/);
    });

    it("treats hook failures as blockers, not bypasses", () => {
      expect(standards).toMatch(/hook failure|fix.*hook|hook.*fix/i);
    });
  });

  describe("implement-prompt.md", () => {
    it("contains an explicit no --no-verify line", () => {
      expect(implementPrompt).toMatch(/--no-verify/);
    });

    it("instructs to fix hook failures, not bypass them", () => {
      expect(implementPrompt).toMatch(
        /fix.*hook|hook.*fail.*fix|hook fails.*fix/i,
      );
    });
  });

  describe("merge-prompt.md", () => {
    it("contains an explicit no --no-verify line", () => {
      expect(mergePrompt).toMatch(/--no-verify/);
    });

    it("instructs to fix hook failures, not bypass them", () => {
      expect(mergePrompt).toMatch(
        /fix.*hook|hook.*fail.*fix|hook fails.*fix|fix it or stop/i,
      );
    });
  });
});
