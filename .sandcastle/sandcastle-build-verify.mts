// Build-verify — decides whether a branch's diff needs a real `pnpm build`
// (isDocsOnlyDiff) and runs it directly in a warm sandbox via sandbox.exec()
// (runBuildVerify), no agent involved.
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as sandcastle from "@ai-hero/sandcastle";
import { BASE_BRANCH } from "./sandcastle-config.mts";

// Patterns that qualify a changed file as "docs-only" — if ALL changed files
// match at least one pattern, the build step is skipped.
const DOCS_ONLY_PATTERNS = [
  /\.mdx?$/,
  /^docs\//,
  /^\.github\//,
  /^\.sandcastle\/[^/]+\.md$/,
  /^LICENSE$/,
  /^\.gitignore$/,
];

export function isDocsOnlyDiff(branch: string): boolean {
  try {
    const out = execSync(
      `git diff --name-only origin/${BASE_BRANCH}...${branch}`,
      {
        encoding: "utf8",
      },
    ).trim();
    if (!out) return true;
    const files = out.split("\n").filter(Boolean);
    return files.every((f) => DOCS_ONLY_PATTERNS.some((p) => p.test(f)));
  } catch {
    return false; // conservative: run the build if check fails
  }
}

export type TurboStats = { successful: number; total: number; cached: number };

// Parses turbo's summary block from agent stdout.
// Turbo prints: "Tasks: N successful, N total\nCached: N cached, N total"
export function parseTurboStats(output: string): TurboStats | null {
  const tasksMatch = output.match(
    /Tasks:\s+(\d+)\s+successful,\s+(\d+)\s+total/,
  );
  const cachedMatch = output.match(/Cached:\s+(\d+)\s+cached,\s+(\d+)\s+total/);
  if (!tasksMatch || !cachedMatch) return null;
  return {
    successful: Number(tasksMatch[1]),
    total: Number(tasksMatch[2]),
    cached: Number(cachedMatch[1]),
  };
}

export function formatMs(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return m > 0 ? `${m}m${String(s).padStart(2, "0")}s` : `${totalSeconds}s`;
}

// `TURBO_CACHE_DIR=/tmp/turbo-cache` keeps turbo's filesystem cache out of the
// bind-mounted repo root. The repo-root `.turbo/` can be root-owned from prior
// container runs while the sandbox runs as a mapped uid, so turbo's default
// `<repo>/.turbo/cache` location fails with "Permission denied (os error 13)"
// and kills the build in seconds (issue #887). turbo 2.9 honors this env var;
// the host pre-push hook already uses the equivalent `--cache-dir /tmp/turbo-cache`.
export const BUILD_VERIFY_COMMAND = "TURBO_CACHE_DIR=/tmp/turbo-cache pnpm build";

// Sandbox.exec() has no built-in timeout (unlike sandbox.run()'s
// idleTimeoutSeconds), so this mirrors the old build-verify agent's 600s guard.
export const BUILD_VERIFY_TIMEOUT_MS = 600_000;

// Runs the build-verify command directly in an already-warm sandbox via
// sandbox.exec() (@ai-hero/sandcastle 0.12.0) instead of spinning up an agent
// to run `pnpm build` and transcribe back the result. Build-verify is purely
// mechanical — zero judgment content — so sandbox.exec()'s real ExecResult
// (stdout, stderr, exitCode) removes the risk of an agent mistyping the exit
// code or truncating turbo's summary, and skips an agent invocation entirely.
//
// sandbox.run()/sandcastle.run() default to file-mode logging under
// .sandcastle/logs/ (auto-named from branch + role); sandbox.exec() has no
// such integration, so this hand-rolls an equivalent log file so a failed
// build stays debuggable after the fact.
export async function runBuildVerify(
  sandbox: Awaited<ReturnType<typeof sandcastle.createSandbox>>,
  logLabel: string,
): Promise<{ passed: boolean; stdout: string; stats: TurboStats | null }> {
  const lines: string[] = [];
  const result = await Promise.race([
    sandbox.exec(BUILD_VERIFY_COMMAND, {
      onLine: (line) => lines.push(line),
    }),
    new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(new Error(`pnpm build exceeded ${BUILD_VERIFY_TIMEOUT_MS}ms`)),
        BUILD_VERIFY_TIMEOUT_MS,
      ),
    ),
  ]);
  const fullStdout = lines.join("\n");
  fs.mkdirSync(".sandcastle/logs", { recursive: true });
  fs.writeFileSync(
    `.sandcastle/logs/build-verify-${logLabel}.log`,
    fullStdout + (result.stderr ? `\n--- stderr ---\n${result.stderr}` : ""),
  );
  return {
    passed: result.exitCode === 0,
    stdout: fullStdout,
    stats: parseTurboStats(fullStdout),
  };
}
