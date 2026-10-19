// @ts-check
//
// The `pre-push` hook's body. `.husky/pre-push` is three lines; this is the part
// worth reading.
//
// git hands a pre-push hook one line per ref on STDIN:
//
//   <local-ref> <local-sha> <remote-ref> <remote-sha>
//
// Reading that, rather than assuming HEAD, is the whole reason this is a script.
// `git push origin <branch>` does not require the branch to be checked out, and
// Sandcastle pushes every agent branch from the host while the host sits on
// `main`. A hook that ran the gate over the working tree would there verify
// `main` and wave the branch through — green for code it never opened. Each sha
// is therefore checked where it actually lives, via `run.mjs --at`.
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { withoutAmbientGit } from './git-env.mjs';
import { NOTES_REF, noteFor, publish, readReceipt, treeOf } from './receipt.mjs';

const RUNNER = fileURLToPath(new URL('./run.mjs', import.meta.url));

/** git's "this ref is being deleted" sentinel. Nothing to verify. */
const DELETION = /^0+$/;

/** @param {string} command @param {readonly string[]} args @returns {string} */
const git = (command, args) =>
  execFileSync('git', [command, ...args], { encoding: 'utf8' }).trim();

/**
 * The refs being pushed, as the shas that need verifying.
 *
 * Notes are skipped: pushing `refs/notes/gate` would re-enter this hook and ask
 * it to verify the receipt it just wrote.
 *
 * @param {string} stdin
 * @returns {readonly string[]}
 */
export function shasToVerify(stdin) {
  const shas = stdin
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => line.split(/\s+/))
    .filter(([localRef, localSha]) => {
      if (localRef === undefined || localSha === undefined) return false;

      return !DELETION.test(localSha) && !localRef.startsWith('refs/notes/');
    })
    .map(([, localSha]) => /** @type {string} */ (localSha));

  return [...new Set(shas)];
}

/** @param {string} sha @returns {boolean} */
function alreadyVerified(sha) {
  // The tree, not the commit: a rebase that changes only a message or a parent
  // leaves the tree the gate actually checked untouched.
  return readReceipt(sha)?.tree === treeOf(sha);
}

/** @param {string} sha @param {string | undefined} remote @returns {boolean} */
function verify(sha, remote) {
  if (alreadyVerified(sha)) {
    process.stdout.write(`gate: ${sha.slice(0, 7)} already verified\n`);

    return true;
  }

  const head = git('rev-parse', ['HEAD']);
  // Only reach for a worktree when the commit is not the one checked out.
  // The common case — pushing what you are sitting on — stays a plain run, and
  // turbo's cache makes it proportional to what changed.
  const at = sha === head ? [] : ['--at', sha];
  // The runner must not inherit this hook's GIT_DIR: everything it starts
  // would then run git against the repository being pushed, whatever directory
  // it was pointed at (#163).
  const result = spawnSync('node', [RUNNER, ...at], {
    stdio: 'inherit',
    env: withoutAmbientGit(),
  });

  if (result.status !== 0) return false;

  execFileSync('git', [
    'notes',
    `--ref=${NOTES_REF}`,
    'add',
    '-f',
    '-m',
    // The hook runs the fast tier, and the receipt now says so rather than
    // leaving `--verify` to imply more than was checked.
    noteFor(sha, 'fast'),
    sha,
  ]);
  // And to the remote, so the receipt is readable by someone other than the
  // machine that wrote it. Best effort — see `publish`.
  publish(remote);

  return true;
}

/** @param {string} stdin @param {string | undefined} remote @returns {number} */
export function run(stdin, remote) {
  // The escape hatch Sandcastle's in-sandbox fallback push uses. The sandbox has
  // no Docker-in-Docker and has already run build-verify, and a hook failing
  // there strands a branch rather than reporting anything.
  if (process.env.SC_SKIP_GATE === '1') {
    process.stdout.write('gate: skipped (SC_SKIP_GATE=1)\n');

    return 0;
  }

  const shas = shasToVerify(stdin);

  if (shas.length === 0) return 0;

  return shas.every((sha) => verify(sha, remote)) ? 0 : 1;
}

/**
 * git's ref lines, read synchronously.
 *
 * Synchronous because a hook that returns before it has decided lets the push
 * through. Guarded on `isTTY` because a read of fd 0 blocks forever when
 * nothing is piped — which is every run that is not git's, including importing
 * this file to look at it.
 *
 * @returns {string}
 */
function readRefLines() {
  if (process.stdin.isTTY === true) return '';

  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

process.exitCode = run(readRefLines(), process.argv[2]);
