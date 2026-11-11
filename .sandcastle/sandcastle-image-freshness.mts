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
// 11.15.1 while both package.json#packageManager and the Dockerfile pinned
// 11.17.0, so every pnpm command tripped pnpm's own packageManager version
// check ("configured to use 11.17.0 … current is v11.15.1"). It surfaced as
// phantom typecheck/lint/test failures across unrelated workspaces and the
// whole 10-issue batch was abandoned as "a flake".
//
// This module runs ONCE at orchestrator startup, before any agent:
//   1. Read the pnpm pin from package.json#packageManager (the single source
//      of truth the Dockerfile installs pnpm from).
//   2. Probe the running image's global pnpm via
//      `docker run --rm --entrypoint pnpm <image> --version`.
//   3. On match: proceed. On drift OR a missing image: rebuild, then re-probe.
//   4. If the rebuilt image STILL disagrees with the pin, throw — the
//      orchestrator refuses to start rather than run the whole batch against a
//      stale toolchain and report ten independent "push failed" comments (the
//      worst outcome per the issue).
//
// pnpm is not the only thing that goes stale. The Claude Code CLI is installed
// unpinned (`curl … install.sh | bash`) and nothing compared it to anything: on
// 2026-10-14 the API began refusing the image's CLI 2.1.233 ("version 2.1.280
// or newer is required"), every planner iteration failed with a 400 before any
// work, and the image passed this guard all the while. So the guard also probes
// `claude --version` and reads the image's `Created` time; a broken CLI or an
// image older than SANDCASTLE_IMAGE_MAX_AGE_DAYS (default 14) is rebuilt with
// `--no-cache`, since a cached install.sh layer would reinstall the same old
// CLI. The CLI version is logged on every start, so a run log always names it.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sandcastleImageName } from './sandcastle-lifecycle.mts';

/**
 * Read the pinned pnpm version (bare semver, e.g. `11.17.0`) from
 * package.json's `packageManager` field — the single source of truth the
 * Dockerfile installs pnpm from. The field looks like
 * `pnpm@11.17.0+sha512.<hash>`; we take the `X.Y.Z` between `pnpm@` and the
 * optional `+<integrity>` suffix.
 *
 * Throws (loudly) when no pnpm pin is present, so
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
 * The `X.Y.Z` in `claude --version`'s output (`2.1.233 (Claude Code)`), or
 * `null` when it carries none.
 */
export function parseClaudeVersion(output: string): string | null {
  return output.match(/\d+\.\d+\.\d+/)?.[0] ?? null;
}

/**
 * Probe the Claude Code CLI baked into an image. `null` when the image is
 * absent or its `claude` does not run — either way it needs a rebuild.
 */
function imageClaudeVersion(imageName: string): string | null {
  try {
    const out = execFileSync(
      'docker',
      ['run', '--rm', '--entrypoint', 'claude', imageName, '--version'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    return parseClaudeVersion(out);
  } catch {
    return null;
  }
}

/** When the image was built, or `null` when it is absent or unreadable. */
function imageCreated(imageName: string): Date | null {
  try {
    const out = execFileSync(
      'docker',
      ['image', 'inspect', '-f', '{{.Created}}', imageName],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    const created = new Date(out.trim());
    return Number.isNaN(created.getTime()) ? null : created;
  } catch {
    return null;
  }
}

export const DEFAULT_IMAGE_MAX_AGE_DAYS = 14;

/**
 * The image age limit from `SANDCASTLE_IMAGE_MAX_AGE_DAYS`, default 14. Throws
 * on a value that is not a positive number, so a typo fails startup instead
 * of silently disabling the age check.
 */
export function readMaxAgeDays(
  env: Record<string, string | undefined> = process.env,
): number {
  const raw = env.SANDCASTLE_IMAGE_MAX_AGE_DAYS;
  if (raw === undefined || raw.trim() === '') return DEFAULT_IMAGE_MAX_AGE_DAYS;
  const days = Number(raw);
  if (!Number.isFinite(days) || days <= 0) {
    throw new Error(
      `SANDCASTLE_IMAGE_MAX_AGE_DAYS must be a positive number of days (got: '${raw}').`,
    );
  }
  return days;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Rebuild the sandbox image from `.sandcastle/Dockerfile`.
 *
 * Uses the stdin form `docker build -t <image> -` (Dockerfile piped in) rather
 * than `docker build -f .sandcastle/Dockerfile .`. The latter uploads the ENTIRE
 * monorepo as build context — there is no `.dockerignore`, so it ships
 * node_modules, `.git`, and nested worktrees and stalls indefinitely. The
 * Dockerfile has zero `COPY` lines, so it needs no context at all; the stdin
 * form sends none.
 *
 * `noCache` is set when the CLI is broken or the image is too old: the CLI's
 * install line never changes, so a cached layer would hand back the same CLI.
 */
function rebuildImage(
  imageName: string,
  dockerfilePath: string,
  opts: RebuildOptions,
): void {
  const dockerfile = readFileSync(resolve(dockerfilePath), 'utf8');
  const noCache = opts.noCache ? ['--no-cache'] : [];
  execFileSync('docker', ['build', ...noCache, '-t', imageName, '-'], {
    input: dockerfile,
    stdio: ['pipe', 'inherit', 'inherit'],
  });
}

export interface RebuildOptions {
  noCache: boolean;
}

export interface EnsureImageFreshnessOptions {
  packageJsonPath?: string;
  dockerfilePath?: string;
  imageName?: string;
  /** Injectable probe (defaults to `imagePnpmVersion`) — for testing. */
  probe?: (imageName: string) => string | null;
  /** Injectable CLI probe (defaults to `imageClaudeVersion`) — for testing. */
  probeClaude?: (imageName: string) => string | null;
  /** Injectable build-time probe (defaults to `imageCreated`) — for testing. */
  probeCreated?: (imageName: string) => Date | null;
  /** The moment the image's age is measured at (defaults to now). */
  now?: Date;
  /** Image age limit in days (defaults to `readMaxAgeDays()`). */
  maxAgeDays?: number;
  /** Injectable rebuild (defaults to `rebuildImage`) — for testing. */
  rebuild?: (imageName: string, dockerfilePath: string, opts: RebuildOptions) => void;
  logger?: Pick<Console, 'log' | 'warn'>;
}

/** Why the image's CLI or age calls for a `--no-cache` rebuild, or `null`. */
function staleImageReason(
  claude: string | null,
  created: Date | null,
  now: Date,
  maxAgeDays: number,
): string | null {
  if (claude === null) return 'has no working claude';
  if (created === null) return null;
  const ageDays = Math.floor((now.getTime() - created.getTime()) / DAY_MS);
  return ageDays > maxAgeDays ? `is ${ageDays} days old (limit ${maxAgeDays})` : null;
}

function pnpmDriftWarning(
  imageName: string,
  current: string | null,
  pinned: string,
): string {
  return current === null
    ? `  ⚠ image ${imageName} missing or has no pnpm — building it (pin: pnpm@${pinned})…`
    : `  ⚠ image ${imageName} pnpm ${current} != package.json pin ${pinned} — ` +
        `rebuilding before any agent starts (a stale image would run the wrong toolchain)…`;
}

/**
 * Startup guard: verify the running sandbox image's pnpm matches the repo pin,
 * its Claude Code CLI runs, and it is no older than the age limit; rebuild
 * (with `--no-cache` for the CLI or the age) before any agent starts. Throws —
 * refusing to start — if a rebuilt image still disagrees with the pnpm pin
 * (e.g. the Dockerfile pins a pnpm that contradicts package.json) or still has
 * no working `claude`.
 */
export function ensureImageFreshness(options: EnsureImageFreshnessOptions = {}): void {
  const {
    packageJsonPath = 'package.json',
    dockerfilePath = '.sandcastle/Dockerfile',
    imageName = sandcastleImageName(),
    probe = imagePnpmVersion,
    probeClaude = imageClaudeVersion,
    probeCreated = imageCreated,
    now = new Date(),
    maxAgeDays = readMaxAgeDays(),
    rebuild = rebuildImage,
    logger = console,
  } = options;

  const pinned = readPinnedPnpmVersion(packageJsonPath);
  const current = probe(imageName);
  const claude = probeClaude(imageName);
  const stale = staleImageReason(claude, probeCreated(imageName), now, maxAgeDays);

  if (current === pinned && stale === null) {
    logger.log(
      `  ✓ image ${imageName} pnpm ${current} matches package.json pin — no rebuild needed`,
    );
    logger.log(`  ✓ image ${imageName} runs Claude Code ${claude}`);
    return;
  }

  if (current !== pinned) logger.warn(pnpmDriftWarning(imageName, current, pinned));
  if (stale !== null) {
    logger.warn(
      `  ⚠ image ${imageName} ${stale} — rebuilding with --no-cache so the Claude Code CLI is reinstalled…`,
    );
  }

  rebuild(imageName, dockerfilePath, { noCache: stale !== null });

  const after = probe(imageName);
  if (after !== pinned) {
    throw new Error(
      `Image ${imageName} still reports pnpm ${after ?? '<none>'} after a rebuild, ` +
        `but package.json pins ${pinned}. Refusing to start: a batch run against a ` +
        `stale toolchain surfaces as ten independent "push failed" comments. ` +
        `Check that ${dockerfilePath} installs pnpm@${pinned}.`,
    );
  }

  const claudeAfter = probeClaude(imageName);
  if (claudeAfter === null) {
    throw new Error(
      `Image ${imageName} still has no working claude after a --no-cache rebuild. ` +
        `Refusing to start: every agent would fail before any work. ` +
        `Check the Claude Code install line in ${dockerfilePath}.`,
    );
  }

  logger.log(`  ✓ rebuilt ${imageName}; pnpm now ${after} matches package.json pin`);
  logger.log(`  ✓ image ${imageName} runs Claude Code ${claudeAfter}`);
}
