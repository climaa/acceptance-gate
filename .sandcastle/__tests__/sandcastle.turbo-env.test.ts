import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const SANDCASTLE = path.join(ROOT, ".sandcastle");

function read(file: string) {
  return fs.readFileSync(path.join(SANDCASTLE, file), "utf8");
}

describe("sandcastle turbo-env passthrough", () => {
  describe("sandcastle-config.mts — TURBO_TOKEN/TURBO_TEAM startup read", () => {
    const content = read("sandcastle-config.mts");
    const runIssueContent = read("sandcastle-run-issue.mts");

    it("reads TURBO_TOKEN from process.env", () => {
      expect(content).toMatch(/process\.env\.TURBO_TOKEN/);
    });

    it("reads TURBO_TEAM from process.env", () => {
      expect(content).toMatch(/process\.env\.TURBO_TEAM/);
    });

    it("exports turboToken/turboTeam for consumers to import", () => {
      expect(content).toMatch(/export const turboToken/);
      expect(content).toMatch(/export const turboTeam/);
    });

    it("sandcastle-run-issue.mts (the createSandbox call site) imports turboToken/turboTeam from sandcastle-config.mts", () => {
      // The read-before-runIssue ordering this replaced no longer has a
      // faithful equivalent once TURBO_TOKEN and runIssue live in different
      // files — asserting the import wiring at the actual consumer is the
      // meaningful post-split check.
      expect(runIssueContent).toMatch(
        /import\s*\{[^}]*turboToken[^}]*\}\s*from\s*["']\.\/sandcastle-config\.mts["']/,
      );
    });

    it("prints warning when TURBO vars are missing", () => {
      expect(content).toMatch(
        /remote cache disabled.*TURBO_TOKEN.*TURBO_TEAM not set/i,
      );
    });

    it("prints presence and length when TURBO vars are set, not the values", () => {
      expect(content).toMatch(/\.length/);
      // Must mention "chars" or "char" to describe length, not raw value
      expect(content).toMatch(/chars/i);
    });

    it("does not log literal token values (no template literal that embeds the env var directly in a string without .length)", () => {
      // Look for any console.log/process.stdout that prints TURBO_TOKEN value directly
      // Acceptable: `TURBO_TOKEN=${x.length} chars`
      // NOT acceptable: `TURBO_TOKEN=${process.env.TURBO_TOKEN}`
      const logLines = content
        .split("\n")
        .filter(
          (line) =>
            (line.includes("console.log") ||
              line.includes("process.stdout.write")) &&
            line.includes("TURBO_TOKEN"),
        );
      for (const line of logLines) {
        // Must not embed the raw env var value — only .length is acceptable
        expect(line).not.toMatch(
          /\$\{turboToken\}|\$\{process\.env\.TURBO_TOKEN\}/,
        );
      }
    });
  });

  describe("createSandbox env passthrough — both call sites", () => {
    // Two call sites create a sandbox: the per-issue pipeline
    // (sandcastle-run-issue.mts) and the stranded-branch rescue path
    // (sandcastle-stranded-branches.mts). Both must be checked — a prior
    // version of this test used content.indexOf(), which only ever matched
    // the first of two occurrences and silently never covered the second.
    const runIssueContent = read("sandcastle-run-issue.mts");
    const strandedBranchesContent = read("sandcastle-stranded-branches.mts");

    function afterCreateSandbox(content: string) {
      const idx = content.indexOf("sandcastle.createSandbox({");
      return content.slice(idx, idx + 600);
    }

    const sites = [
      ["sandcastle-run-issue.mts", afterCreateSandbox(runIssueContent)],
      [
        "sandcastle-stranded-branches.mts",
        afterCreateSandbox(strandedBranchesContent),
      ],
    ] as const;

    it.each(sites)(
      "%s: createSandbox call includes an env option",
      (_name, afterCreate) => {
        expect(afterCreate).toMatch(/env\s*:/);
      },
    );

    it.each(sites)(
      "%s: createSandbox env includes TURBO_TOKEN",
      (_name, afterCreate) => {
        expect(afterCreate).toMatch(/TURBO_TOKEN/);
      },
    );

    it.each(sites)(
      "%s: createSandbox env includes TURBO_TEAM",
      (_name, afterCreate) => {
        expect(afterCreate).toMatch(/TURBO_TEAM/);
      },
    );

    it.each(sites)(
      "%s: createSandbox env does NOT include dead TURBO_CACHE_DIR (Turbo v2 ignores it)",
      (_name, afterCreate) => {
        expect(afterCreate).not.toMatch(/TURBO_CACHE_DIR/);
      },
    );
  });

  describe("createSandbox docker uid mapping — both call sites", () => {
    const runIssueContent = read("sandcastle-run-issue.mts");
    const strandedBranchesContent = read("sandcastle-stranded-branches.mts");

    function afterCreateSandbox(content: string) {
      const idx = content.indexOf("sandcastle.createSandbox({");
      return content.slice(idx, idx + 600);
    }

    const sites = [
      ["sandcastle-run-issue.mts", afterCreateSandbox(runIssueContent)],
      [
        "sandcastle-stranded-branches.mts",
        afterCreateSandbox(strandedBranchesContent),
      ],
    ] as const;

    it.each(sites)(
      "%s: docker() in createSandbox passes containerUid so container writes bind-mounts as host uid",
      (_name, afterCreate) => {
        expect(afterCreate).toMatch(/containerUid/);
      },
    );

    it.each(sites)(
      "%s: docker() in createSandbox passes containerGid",
      (_name, afterCreate) => {
        expect(afterCreate).toMatch(/containerGid/);
      },
    );

    it.each(sites)(
      "%s: containerUid is derived from process.getuid",
      (_name, afterCreate) => {
        expect(afterCreate).toMatch(/process\.getuid/);
      },
    );

    it.each(sites)(
      "%s: containerGid is derived from process.getgid",
      (_name, afterCreate) => {
        expect(afterCreate).toMatch(/process\.getgid/);
      },
    );

    it.each(sites)(
      "%s: containerUid falls back to 1000 when process.getuid is unavailable (e.g. Windows)",
      (_name, afterCreate) => {
        expect(afterCreate).toMatch(
          /getuid[^)]*\?\s*\.\s*\(\s*\)\s*\?\?.*1000|getuid\?\.\(\)\s*\?\?\s*1000/,
        );
      },
    );
  });

  describe(".env.example — documentation block only, no KEY= lines", () => {
    const content = read(".env.example");

    it("mentions TURBO_TOKEN in a comment", () => {
      expect(content).toMatch(/#.*TURBO_TOKEN|TURBO_TOKEN.*#/i);
    });

    it("mentions TURBO_TEAM in a comment", () => {
      expect(content).toMatch(/#.*TURBO_TEAM|TURBO_TEAM.*#/i);
    });

    it("does not add TURBO_TOKEN= as a KEY= line", () => {
      expect(content).not.toMatch(/^TURBO_TOKEN\s*=/m);
    });

    it("does not add TURBO_TEAM= as a KEY= line", () => {
      expect(content).not.toMatch(/^TURBO_TEAM\s*=/m);
    });

    it("mentions turbo login or turbo link for setup", () => {
      expect(content).toMatch(/turbo login|turbo link/i);
    });
  });
});
