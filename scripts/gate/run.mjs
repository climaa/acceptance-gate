// @ts-check
//
// Runs the gate — the same checks CI runs, from `manifest.mjs`.
//
//   pnpm gate                     the fast tier, in the working tree
//   pnpm gate --tier full         adds visual-diff (needs Docker)
//   pnpm gate --at <sha>          in a throwaway worktree at that commit
//   pnpm gate --list              the manifest as JSON, for the CI matrix
//   pnpm gate --verify [ref]      was this tree ever verified? (default HEAD)
//   pnpm gate --no-wait           refuse at once if another gate holds the machine
//
// One gate runs per machine, across checkouts: the runner takes `lock.mjs`'s lock
// before its first check, and a second gate waits for it, saying once whose turn
// it is. `--no-wait` refuses instead of waiting, with the same sentence.
//
// `--at` is not a convenience. `git push origin <branch>` does not require that
// branch to be checked out, and Sandcastle (`.sandcastle/main.mts`, the
// `[ci-trigger]` loop) pushes every agent branch from the host while the host
// sits on `main`. A hook that verified the working tree would there be testing
// `main` and reporting green for a branch whose contents it never read.
//
// The orchestrator is carried in this repo but is not yet driving it, so today
// every push is of the branch you are on and `--at` never fires. It is here
// because the hook cannot tell the two cases apart at the moment it has to
// decide, and a verification that is only correct while nobody uses the other
// path is not one.
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { withoutAmbientGit } from './git-env.mjs';
import {
  acquire,
  formatDuration,
  lockPath,
  release,
  releaseOnExit,
  stopSignalExit,
} from './lock.mjs';
import { CHECKS, checksFor } from './manifest.mjs';
import { compareNodeVersion, readNvmrc } from './node-version.mjs';
import { findReceipt, NOTES_REF, noteFor, TIMINGS_ENV, treeOf } from './receipt.mjs';
import { planFor } from './sandbox.mjs';
import { worktreeAt } from './worktree.mjs';

/** Repo root: this file is two levels down. Resolved from the module URL rather
 *  than cwd, so a hook invoking it from anywhere still finds the repo. */
const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));

/** Same shape as `packages/visual-diff/src/policy.mjs` — one exit vocabulary. */
const EXIT = { ok: 0, failed: 1, broken: 2 };

/** @param {readonly string[]} argv */
function parse(argv) {
  const at = argv.indexOf('--at');
  const tier = argv.indexOf('--tier');

  const verify = argv.indexOf('--verify');

  return {
    list: argv.includes('--list'),
    wait: !argv.includes('--no-wait'),
    verify:
      verify === -1
        ? undefined
        : // `--tier` after `--verify` is the tier DEMANDED, not the tier to run.
          (argv[verify + 1] ?? 'HEAD').startsWith('--')
          ? 'HEAD'
          : (argv[verify + 1] ?? 'HEAD'),
    at: at === -1 ? undefined : argv[at + 1],
    tier: /** @type {'fast' | 'full'} */ (
      tier === -1 ? 'fast' : (argv[tier + 1] ?? 'fast')
    ),
  };
}

/**
 * A check's outcome; a number is the exit code of a step a stop signal ended.
 *
 * @typedef {'passed' | 'failed' | number} Outcome
 */

/**
 * One check, in `root`. Inherits stdio: the point of a local gate is that the
 * failure reads the same as it does when run by hand.
 *
 * @param {import('./manifest.mjs').Check} check
 * @param {string} root
 * @returns {Outcome}
 */
function runCheck(check, root) {
  const cwd = check.cwd === undefined ? root : join(root, check.cwd);
  const steps =
    check.setup === undefined ? [check.command] : [check.setup, check.command];

  process.stdout.write(`\n→ ${check.name}\n`);

  for (const step of steps) {
    // `withoutAmbientGit`: a hook exports GIT_DIR, and a check that inherited
    // it would run git against the repository being pushed rather than the one
    // it is looking at (#163).
    const result = spawnSync(step, {
      cwd,
      shell: true,
      stdio: 'inherit',
      env: withoutAmbientGit(),
    });

    // Ctrl-C reaches the step and this process alike, but the lock's signal
    // listener cannot run while `spawnSync` blocks, so the runner stops here
    // itself and exits as the signal would have made it.
    const stopped = stopSignalExit(result);

    if (stopped !== undefined) return stopped;

    if (result.status !== 0) {
      process.stdout.write(`\n✗ ${check.name} — ${check.why}\n`);

      return 'failed';
    }
  }

  return 'passed';
}

/**
 * Every check runs even after one fails, mirroring the workflow's
 * `fail-fast: false`: one push should report every problem it has, not the
 * first one alphabetically. A stop signal ends the run at once.
 *
 * @param {readonly import('./manifest.mjs').Check[]} checks
 * @param {string} root
 * @returns {{ failed: import('./manifest.mjs').Check[], stopped?: number }}
 */
function runChecks(checks, root) {
  /** @type {import('./manifest.mjs').Check[]} */
  const failed = [];

  for (const check of checks) {
    const outcome = runCheck(check, root);

    if (typeof outcome === 'number') return { failed, stopped: outcome };
    if (outcome === 'failed') failed.push(check);
  }

  return { failed };
}

/**
 * Say how long the gate waited and ran, and hand both to the hook that asked.
 *
 * @param {import('./receipt.mjs').Timings} timings
 * @returns {void}
 */
function reportTimings(timings) {
  process.stdout.write(
    `  waited ${formatDuration(timings.waitedMs)} for the machine's gate lock, ` +
      `ran ${formatDuration(timings.ranMs)}\n`,
  );

  const file = process.env[TIMINGS_ENV];

  if (file !== undefined && file !== '') writeFileSync(file, JSON.stringify(timings));
}

/**
 * Was this tree ever verified?
 *
 * BY TREE, NOT BY COMMIT, and that is the whole of it. A receipt is written on
 * the branch tip that was pushed; a squash-merge then lands a NEW commit that no
 * note is attached to, so `git notes show main` answers "no note found" for a
 * tree the gate did check. Asking by tree finds the receipt that vouches for it.
 *
 * This does not re-run anything and cannot: it reports what a machine claimed,
 * which is what a receipt is. A tree with no receipt is a tree nothing here can
 * speak for — it may have been verified on someone else's machine and never
 * published, or pushed with `SC_SKIP_GATE=1`, or never checked at all.
 *
 * @param {string} ref
 * @returns {number}
 */
function reportReceipt(ref, wanted) {
  const receipt = findReceipt(ref);

  if (receipt === null) {
    process.stdout.write(
      `✗ no receipt for ${ref} (tree ${treeOf(ref).slice(0, 12)})\n` +
        `  nothing here can say this tree was verified. \`git fetch origin ` +
        `'refs/notes/*:refs/notes/*'\` first if the receipt was written elsewhere.\n`,
    );

    return EXIT.failed;
  }

  const via = receipt.sha.slice(0, 7);

  // Asking for `full` and getting `fast` is a real answer, not a missing one:
  // the tree was checked, but not by the check that reads pixels.
  if (wanted === 'full' && receipt.tier !== 'full') {
    process.stdout.write(
      `✗ ${ref} verified at the ${receipt.tier} tier, not full — ` +
        `receipt on ${via}, ${receipt.at}\n` +
        `  the differ never ran for this tree. \`pnpm gate --tier full\` writes ` +
        `the stronger receipt.\n`,
    );

    return EXIT.failed;
  }

  process.stdout.write(
    `✓ ${ref} verified (${receipt.tier}) — receipt on ${via}, ${receipt.at}\n`,
  );

  return EXIT.ok;
}

/**
 * Write a receipt for HEAD after a passing run, so a tier the hook never runs
 * can still leave evidence.
 *
 * ONLY WHEN THE WORKING TREE IS CLEAN, which is the whole condition. This runner
 * checks the working tree; HEAD's tree is a different object the moment anything
 * is uncommitted, and a receipt naming HEAD after checking something else would
 * be precisely the false claim the receipt exists to prevent. A dirty tree gets
 * the run and no note.
 *
 * @param {'fast' | 'full'} tier
 * @param {import('./receipt.mjs').Timings} timings
 * @returns {void}
 */
function recordReceipt(tier, timings) {
  const status = spawnSync('git', ['status', '--porcelain'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });

  if (status.status !== 0) return;

  if (status.stdout.trim() !== '') {
    process.stdout.write(
      `  no receipt written: the working tree is dirty, so HEAD is not what ran\n`,
    );

    return;
  }

  const head = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });

  if (head.status !== 0) return;

  const sha = head.stdout.trim();

  spawnSync(
    'git',
    ['notes', `--ref=${NOTES_REF}`, 'add', '-f', '-m', noteFor(sha, tier, timings), sha],
    { cwd: REPO_ROOT, encoding: 'utf8' },
  );

  process.stdout.write(`  receipt written for ${sha.slice(0, 7)} (${tier})\n`);
}

/** @param {readonly string[]} argv @returns {number} */
export function run(argv) {
  const { list, wait, verify, at, tier } = parse(argv);

  if (verify !== undefined) {
    // `--tier` alongside `--verify` names the tier required of the receipt.
    return reportReceipt(verify, argv.includes('--tier') ? tier : undefined);
  }

  if (list) {
    process.stdout.write(`${JSON.stringify(CHECKS)}\n`);

    return EXIT.ok;
  }

  // Before any check and before any worktree: a run on a Node other than the one
  // `.nvmrc` declares is refused outright, never warned about, so no receipt can
  // follow it. `--list` and `--verify` above read data and run nothing, so they
  // answer on any Node. Under `--at`, the `.nvmrc` of the commit being verified:
  // the receipt is for that tree, so the tree's declared Node is the one to match.
  const node = compareNodeVersion(readNvmrc(REPO_ROOT, at), process.version, at);

  if (!node.ok) {
    process.stdout.write(node.message);

    return EXIT.broken;
  }

  // Inside the Sandcastle sandbox: every check but e2e, and no receipt — see
  // `sandbox.mjs`. On the host this is the tier's checks, and a receipt.
  const plan = planFor(checksFor(tier), process.env);
  const { checks } = plan;

  if (plan.note !== undefined) process.stdout.write(`${plan.note}\n`);

  const lock = lockPath(process.env);
  const held = acquire({
    path: lock,
    checkout: REPO_ROOT.replace(/\/$/, ''),
    tier,
    wait,
  });

  if (!held.ok) {
    process.stdout.write(`${held.sentence}; --no-wait, so this one stops.\n`);

    return EXIT.broken;
  }

  releaseOnExit(lock);

  const started = Date.now();
  const tree = at === undefined ? undefined : worktreeAt(at);
  const root = tree?.root ?? REPO_ROOT;

  try {
    const { failed, stopped } = runChecks(checks, root);

    // Stopped by a signal: exit as it would have, with the lock released.
    if (stopped !== undefined) return stopped;

    const timings = { waitedMs: held.waitedMs, ranMs: Date.now() - started };

    reportTimings(timings);

    if (failed.length === 0) {
      process.stdout.write(`\n✓ gate (${tier}) — ${checks.length} check(s)\n`);

      // Only for a run of the working tree. `--at` checks a throwaway worktree at
      // another commit, and HEAD is not what was verified there.
      if (at === undefined && plan.receipt) recordReceipt(tier, timings);

      return EXIT.ok;
    }

    process.stdout.write(
      `\n✗ gate (${tier}) — ${failed.map((c) => c.name).join(', ')}\n`,
    );

    return EXIT.failed;
  } finally {
    tree?.dispose();
    release(lock);
  }
}

process.exitCode = run(process.argv.slice(2));
