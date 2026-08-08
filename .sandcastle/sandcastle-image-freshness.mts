// Image-freshness guard.
//
// The docker() factory in main.mts reuses whatever is already tagged
// `sandcastle:<checkout-dirname>` (see defaultImageName() in the package and
// sandcastleImageName() in sandcastle-lifecycle.mts). Editing `.sandcastle/
// Dockerfile` — e.g. bumping the globally-installed pnpm — does NOT invalidate
// that tag, so a stale image silently keeps running the old toolchain.
//
// That is exactly what bit one production batch: a bump moved pnpm
// 11.15.1 -> 11.17.0 in both package.json#packageManager and the Dockerfile,
// but the image was never rebuilt. Every container ran the stale global pnpm
// 11.15.1 while `.husky/pre-push` invoked `corepack pnpm@11.17.0`, which
// hard-failed its own version check ("configured to use 11.17.0 … current is
// v11.15.1"). It surfaced as phantom typecheck/lint/test failures across
// unrelated workspaces and the whole 10-issue batch was abandoned as "a flake".
//
// This module runs ONCE at orchestrator startup, before any agent:
//   1. Read the pnpm pin from package.json#packageManager (same single source
//      of truth the pre-push hook reads).
//   2. Probe the running image's global pnpm via
//      `docker run --rm --entrypoint pnpm <image> --version`.
//   3. On match: proceed. On drift OR a missing image: rebuild, then re-probe.
//   4. If the rebuilt image STILL disagrees with the pin, throw — the
//      orchestrator refuses to start rather than run the whole batch against a
//      stale toolchain and report ten independent "push failed" comments (the
//      worst outcome per the issue).

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sandcastleImageName } from './sandcastle-lifecycle.mts';

/**
 * Read the pinned pnpm version (bare semver, e.g. `11.17.0`) from
 * package.json's `packageManager` field — the same single source of truth
 * `.husky/pre-push` reads via `corepack pnpm@<version>`. The field looks like
 * `pnpm@11.17.0+sha512.<hash>`; we take the `X.Y.Z` between `pnpm@` and the
 * optional `+<integrity>` suffix.
 *
 * Throws (loudly, like the pre-push hook does) when no pnpm pin is present, so
 * a malformed package.json fails startup instead of being papered over.
 */
export function readPinnedPnpmVersion(packageJsonPath = 'package.json'): string {
  const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
    packageManager?: string;
  };
  const spec = pkg.packageManager ?? '';
  const match = spec.match(/^pnpm@(\d+\.\d+\.\d+)/);
  if (!match) {
    throw new Error(
      `Could not read a pnpm pin from ${packageJsonPath} "packageManager" ` +
        `(got: '${spec}'). Expected e.g. "pnpm@11.17.0".`,
    );
  }
  return match[1]!;
}

/**
 * Probe the global pnpm version baked into an image by running its `pnpm
 * --version`. Returns the trimmed version string, or `null` when the image
 * is absent locally / has no pnpm on PATH (either way it needs a rebuild).
 */
function imagePnpmVersion(imageName: string): string | null {
  try {
    const out = execFileSync(
      'docker',
      ['run', '--rm', '--entrypoint', 'pnpm', imageName, '--version'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    return out.trim() || null;
  } catch {
    // Missing image, missing pnpm, or docker error — treat as "needs rebuild".
    return null;
  }
}

/**
 * Rebuild the sandbox image from `.sandcastle/Dockerfile`.
 *
 * Uses the stdin form `docker build -t <image> -` (Dockerfile piped in) rather
 * than `docker build -f .sandcastle/Dockerfile .`. The latter uploads the ENTIRE
 * monorepo as build context — there is no `.dockerignore`, so it ships
 * node_modules, `.git`, and nested worktrees and stalls indefinitely. The
 * Dockerfile has zero `COPY` lines, so it needs no context at all; the stdin
 * form sends none.
 */
function rebuildImage(imageName: string, dockerfilePath: string): void {
  const dockerfile = readFileSync(resolve(dockerfilePath), 'utf8');
  execFileSync('docker', ['build', '-t', imageName, '-'], {
    input: dockerfile,
    stdio: ['pipe', 'inherit', 'inherit'],
  });
}

export interface EnsureImageFreshnessOptions {
  packageJsonPath?: string;
  dockerfilePath?: string;
  imageName?: string;
  /** Injectable probe (defaults to `imagePnpmVersion`) — for testing. */
  probe?: (imageName: string) => string | null;
  /** Injectable rebuild (defaults to `rebuildImage`) — for testing. */
  rebuild?: (imageName: string, dockerfilePath: string) => void;
  logger?: Pick<Console, 'log' | 'warn'>;
}

/**
 * Startup guard: verify the running sandbox image's pnpm matches the repo pin
 * and force a rebuild on drift (or a missing image) before any agent starts.
 * Throws — refusing to start — if the image still disagrees after a rebuild
 * (e.g. the Dockerfile pins a pnpm that contradicts package.json).
 */
export function ensureImageFreshness(options: EnsureImageFreshnessOptions = {}): void {
  const {
    packageJsonPath = 'package.json',
    dockerfilePath = '.sandcastle/Dockerfile',
    imageName = sandcastleImageName(),
    probe = imagePnpmVersion,
    rebuild = rebuildImage,
    logger = console,
  } = options;

  const pinned = readPinnedPnpmVersion(packageJsonPath);
  const current = probe(imageName);

  if (current === pinned) {
    logger.log(
      `  ✓ image ${imageName} pnpm ${current} matches package.json pin — no rebuild needed`,
    );
    return;
  }

  logger.warn(
    current === null
      ? `  ⚠ image ${imageName} missing or has no pnpm — building it (pin: pnpm@${pinned})…`
      : `  ⚠ image ${imageName} pnpm ${current} != package.json pin ${pinned} — ` +
          `rebuilding before any agent starts (a stale image would run the wrong toolchain)…`,
  );

  rebuild(imageName, dockerfilePath);

  const after = probe(imageName);
  if (after !== pinned) {
    throw new Error(
      `Image ${imageName} still reports pnpm ${after ?? '<none>'} after a rebuild, ` +
        `but package.json pins ${pinned}. Refusing to start: a batch run against a ` +
        `stale toolchain surfaces as ten independent "push failed" comments. ` +
        `Check that ${dockerfilePath} installs pnpm@${pinned}.`,
    );
  }

  logger.log(`  ✓ rebuilt ${imageName}; pnpm now ${after} matches package.json pin`);
}
