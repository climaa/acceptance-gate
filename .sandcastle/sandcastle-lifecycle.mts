// Sandcastle lifecycle helpers — a *partial* port of an earlier single-runner orchestrator's
// an earlier single-runner variant of this orchestrator.
//
// the single-runner variant hardens a single-agent HEAD-mode run (one sandbox
// bind-mounts the host's current branch in place). That shape does not fit
// this repo's `main.mts`, which is a 4-phase Plan → Implement+Review → Merge
// loop driving many issues per iteration through per-issue git *worktrees*.
// So rather than porting the class (and its HEAD-mode-only pieces —
// assertTaskNotBlank / ensureCleanBaseBranch / finalizeMerge), this module
// exports plain, architecture-agnostic helpers that `main.mts` wires in:
//
//   1. installGracefulShutdown() — SIGINT/SIGTERM → AbortController.abort()
//   2. reapExitedContainers()    — remove leftover `status=exited` sandbox
//                                  containers scoped to this repo's image
//   3. sandcastleImageName()     — mirror the docker() factory's image tag
//   4. withRetry()               — generic retry wrapper for transient async
//                                  failures (startup/shutdown hardening)
//
// The port is deliberately partial — serial multi-issue dispatch needs less machinery.

import { execFileSync } from 'node:child_process';

/**
 * Derive the Docker image tag that `@ai-hero/sandcastle`'s `docker()` factory
 * assigns by default when no `imageName` is passed (main.mts calls `docker()`
 * bare). Mirrors `defaultImageName()` in the package
 * (`node_modules/@ai-hero/sandcastle/dist/chunk-VOG34SRF.js`, v0.12.0):
 *
 *   `sandcastle:<sanitized basename of the host repo dir>`
 *
 * where sanitize lowercases and replaces every char outside `[a-z0-9_.-]`
 * with `-`. We intentionally re-derive it here instead of hard-coding
 * `sandcastle:<repo-basename>` (the single-runner's assumption) because the tag tracks
 * the checkout directory name, not the GitHub repo name — a wrong tag would
 * make the reap filter match nothing (safe but useless) or the wrong
 * containers.
 */
export function sandcastleImageName(repoDir: string = process.cwd()): string {
  const dirName =
    repoDir
      .replace(/[\\/]+$/, '')
      .split(/[\\/]/)
      .pop() ?? 'local';
  const sanitized = dirName.toLowerCase().replace(/[^a-z0-9_.-]/g, '-');
  return `sandcastle:${sanitized || 'local'}`;
}

/**
 * Graceful shutdown. `main.mts` has no SIGINT/SIGTERM handling today, so Ctrl-C
 * orphans whatever sandbox is in flight. Returns an `AbortController` whose
 * `signal` the caller threads into every `sandcastle.run` / `sandbox.run` call;
 * the first SIGINT/SIGTERM aborts it, which stops *starting* new agent work
 * while in-flight runs still hit their `finally { sandbox.close() }` cleanup.
 *
 * Handlers are registered with `process.once`, so after the first signal the
 * listener is removed and Node's default terminate action is restored — a
 * second Ctrl-C force-quits, the conventional escape hatch if cleanup hangs.
 */
export function installGracefulShutdown(): AbortController {
  const controller = new AbortController();
  const onSignal = (sig: NodeJS.Signals) => {
    console.warn(
      `\n⚠ received ${sig} — aborting: no new sandbox work will start; ` +
        `in-flight sandboxes finish their cleanup (Ctrl-C again to force-quit)…`,
    );
    controller.abort(new Error(`Aborted by ${sig}`));
  };
  process.once('SIGINT', () => onSignal('SIGINT'));
  process.once('SIGTERM', () => onSignal('SIGTERM'));
  return controller;
}

/**
 * Reap leftover sandbox containers left behind by a previously-killed run.
 * Meant to run ONCE at orchestrator startup (mirrors the single-runner's `preflight()`),
 * not per-issue/per-attempt — `main.mts` already `close()`s its sandboxes in
 * `finally` blocks, so the single-runner's per-attempt `cleanupSpawned()` churn would
 * be redundant here.
 *
 * Scope is deliberately narrow: `status=exited` containers whose ancestor is
 * this repo's sandcastle image only. There is no lock/pidfile preventing a
 * second concurrent `pnpm sandcastle` invocation, so reaping anything broader
 * than `exited` (e.g. `created`/`running`) risks tearing down a container a
 * concurrent run just started and hasn't `close()`d yet. `docker rm` (no `-f`)
 * further guarantees we never kill a live container.
 *
 * Best-effort: a missing/broken docker CLI logs a warning and returns 0 rather
 * than aborting startup. Returns the number of containers removed.
 */
export function reapExitedContainers(imageName: string = sandcastleImageName()): number {
  let ids: string[];
  try {
    const out = execFileSync(
      'docker',
      [
        'ps',
        '-a', // include stopped containers; status filter alone won't
        '--filter',
        'status=exited',
        '--filter',
        `ancestor=${imageName}`,
        '--format',
        '{{.ID}}',
      ],
      { encoding: 'utf8' },
    );
    ids = out
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
  } catch (err) {
    console.warn(
      `  ⚠ container reap skipped: \`docker ps\` failed (${(err as Error).message})`,
    );
    return 0;
  }

  if (ids.length === 0) return 0;

  let removed = 0;
  for (const id of ids) {
    try {
      execFileSync('docker', ['rm', id], { stdio: 'pipe' });
      removed++;
    } catch (err) {
      console.warn(
        `  ⚠ could not remove exited container ${id}: ${(err as Error).message}`,
      );
    }
  }
  console.log(
    `  🧹 reaped ${removed} exited sandcastle container(s) for image ${imageName}`,
  );
  return removed;
}

// Retry wrapper for transient async failures (e.g. SandboxLifecycle git race —
// Known failure mode: a stale `.git` view through the bind mount right after a
// worktree op, surfacing as "ambiguous argument 'HEAD'"). Its ONLY callers are
// the createSandbox() sites in sandcastle-run-issue.mts and
// sandcastle-stranded-branches.mts, so its defaults are tuned for that class
// of failure: 3 attempts with escalating linear backoff (3s, then 6s), bumped
// from the old 2×2s up toward the single-runner's isTransientSetupError() 3×(3s/6s/9s)
// budget (graceful-shutdown hardening) — a slow worktree gitdir fsync sometimes needs more than
// one 2s pause to settle.
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  delayMs = 3000,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        const wait = delayMs * attempt; // 3s, 6s, … escalating
        console.warn(
          `  ⚠ attempt ${attempt}/${maxAttempts} failed (${(err as Error).message}); retrying in ${wait}ms…`,
        );
        await new Promise((resolve) => setTimeout(resolve, wait));
      }
    }
  }
  throw lastError;
}
