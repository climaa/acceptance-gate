// Build-verify — decides whether a branch's diff needs a real `pnpm build`
// (isDocsOnlyDiff) and runs it directly in a warm sandbox via sandbox.exec()
// (runBuildVerify), no agent involved.
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as sandcastle from '@ai-hero/sandcastle';
import { BASE_BRANCH } from './sandcastle-config.mts';
import {
  BUILD_VERIFY_COMMAND,
  BUILD_VERIFY_TIMEOUT_MS,
} from './sandcastle-variables.mts';

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

// Pure decision: is every changed file docs-only? An empty list is docs-only —
// nothing changed, so there is nothing to build. Extracted from isDocsOnlyDiff
// so the rule is unit-testable without shelling out to git.
export function isDocsOnlyFileList(files: string[]): boolean {
  return files.every((f) => DOCS_ONLY_PATTERNS.some((p) => p.test(f)));
}

export function isDocsOnlyDiff(branch: string): boolean {
  try {
    const out = execSync(`git diff --name-only origin/${BASE_BRANCH}...${branch}`, {
      encoding: 'utf8',
    }).trim();
    const files = out.split('\n').filter(Boolean);
    return isDocsOnlyFileList(files);
  } catch {
    return false; // conservative: run the build if the diff check fails
  }
}

export type TurboStats = { successful: number; total: number; cached: number };

// Parses turbo's summary block from agent stdout.
// Turbo prints: "Tasks: N successful, N total\nCached: N cached, N total"
export function parseTurboStats(output: string): TurboStats | null {
  const tasksMatch = output.match(/Tasks:\s+(\d+)\s+successful,\s+(\d+)\s+total/);
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
  return m > 0 ? `${m}m${String(s).padStart(2, '0')}s` : `${totalSeconds}s`;
}

/**
 * Race `work` against a timeout, ALWAYS clearing the timer on settlement.
 *
 * The bug this fixes: a bare `Promise.race([work, setTimeout(reject, T)])`
 * never clears the timer when `work` wins, so the pending timeout keeps the
 * event loop alive for the full T after the build has already finished — the
 * orchestrator prints "All done." and then hangs until the last timer fires
 * (T = BUILD_VERIFY_TIMEOUT_MS = 10 minutes, once per verified branch).
 *
 * Extracted so the clear-on-every-path behavior is unit-testable with fake
 * timers (getTimerCount() === 0 after settlement), which a call-site-inlined
 * race is not. When the timeout wins, the caller still sees the rejection; the
 * underlying `work` is left to settle on its own (this helper does not cancel
 * it — build-verify has no cancellation handle to offer).
 */
const TIMED_OUT = Symbol('timed-out');

export async function raceWithTimeout<T>(
  work: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  // The timeout branch RESOLVES a sentinel rather than rejecting. A rejecting
  // timeout promise is briefly unhandled in the window between the timer firing
  // and Promise.race attaching its catch — harmless in production but it trips
  // unhandled-rejection detectors. Resolving a sentinel and throwing after the
  // race is behaviorally identical (timeout → this message; work rejection →
  // its own error passes through) with no free-floating rejectable promise.
  const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), timeoutMs);
  });
  try {
    const result = await Promise.race([work, timeout]);
    if (result === TIMED_OUT) throw new Error(message);
    return result;
  } finally {
    clearTimeout(timer);
  }
}

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
  // Sink-side tripwire: logLabel becomes a filename below, so a path-traversal
  // value like `../../etc/x` must never reach writeFileSync. Callers pass the
  // issue id (or `rescued-<id>`); this guard fires if that id ever arrives
  // unvalidated — defense-in-depth at the sink, independent of any upstream
  // validation of the plan.
  if (!/^[A-Za-z0-9_-]+$/.test(logLabel)) {
    throw new Error(
      `runBuildVerify: refusing unsafe log label ${JSON.stringify(logLabel)}`,
    );
  }
  const lines: string[] = [];
  const result = await raceWithTimeout(
    sandbox.exec(BUILD_VERIFY_COMMAND, {
      onLine: (line) => lines.push(line),
    }),
    BUILD_VERIFY_TIMEOUT_MS,
    `pnpm build exceeded ${BUILD_VERIFY_TIMEOUT_MS}ms`,
  );
  const fullStdout = lines.join('\n');
  fs.mkdirSync('.sandcastle/logs', { recursive: true });
  fs.writeFileSync(
    `.sandcastle/logs/build-verify-${logLabel}.log`,
    fullStdout + (result.stderr ? `\n--- stderr ---\n${result.stderr}` : ''),
  );
  return {
    passed: result.exitCode === 0,
    stdout: fullStdout,
    stats: parseTurboStats(fullStdout),
  };
}
