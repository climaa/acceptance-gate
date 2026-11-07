// @ts-check
//
// One gate per machine, across checkouts.
//
// Several checkouts on one machine — this repository and the children seeded
// from it — are pushed in the same hour, by a person and by Sandcastle's host
// push, and every push runs a gate. Two at once bind the same e2e ports and
// double `turbo run test`'s load: on 1 Nov 2026 two host pushes in a child
// failed five times on timeouts in suites their branches never touched, at a
// load average of 13–25 on 12 cores, and passed once the machine was quiet.
// So the runner takes this lock before its first check and the second gate
// waits its turn, saying once whose turn it is.
//
// THE FILE LIVES OUTSIDE EVERY CHECKOUT, under one name for every repository
// seeded from this one (`~/.cache/acceptance-gate/gate.lock`), so the gates of
// different checkouts find the same file. The home directory, not `os.tmpdir()`:
// a hook may run without `TMPDIR`, and two gates reading two temp directories
// would never see each other. `GATE_LOCK` names another file, for the tests.
//
// The lock covers gates only. A suite someone runs by hand takes no lock.
import {
  closeSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { constants, homedir } from 'node:os';
import { dirname, join } from 'node:path';

/** The variable that moves the lock file, for the tests. */
export const LOCK_ENV = 'GATE_LOCK';

/** @param {NodeJS.ProcessEnv} env @returns {string} */
export const lockPath = (env) =>
  env[LOCK_ENV] || join(homedir(), '.cache', 'acceptance-gate', 'gate.lock');

/**
 * What the lock file records.
 *
 * @typedef {object} Holder
 * @property {number} pid
 * @property {string} checkout
 * @property {string} tier
 * @property {string} startedAt  ISO time the holder took the lock.
 */

/** @param {number} ms @returns {string} */
export function formatDuration(ms) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(seconds / 60);

  if (minutes === 0) return `${seconds}s`;

  return `${minutes}m${String(seconds % 60).padStart(2, '0')}s`;
}

/**
 * The one sentence a gate that finds the lock held prints, waiting or not.
 *
 * @param {Holder} holder
 * @param {number} now
 * @returns {string}
 */
export const heldSentence = (holder, now) =>
  `gate: the ${holder.tier} gate in ${holder.checkout} (pid ${holder.pid}) ` +
  `has held this machine for ${formatDuration(now - Date.parse(holder.startedAt))}`;

/** A pid this user may signal, or one that exists under another user.
 *  @param {number} pid @returns {boolean} */
function alive(pid) {
  try {
    process.kill(pid, 0);

    return true;
  } catch (error) {
    return /** @type {NodeJS.ErrnoException} */ (error).code === 'EPERM';
  }
}

/**
 * The holder, `null` if the file is gone, or `undefined` if it cannot be read
 * as one — which only a hand edit produces, since `take` never leaves a
 * half-written lock.
 *
 * @param {string} path
 * @returns {Holder | null | undefined}
 */
function readHolder(path) {
  let text;

  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return null;
  }

  try {
    const holder = JSON.parse(text);

    return Number.isInteger(holder?.pid) ? holder : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Take the lock if it is free. Written to a file of its own first and then
 * hard-linked into place: the link either creates the lock whole or fails
 * because it exists, so no reader ever finds it empty.
 *
 * @param {string} path
 * @param {Omit<Holder, 'startedAt'>} who
 * @returns {boolean}
 */
function take(path, who) {
  mkdirSync(dirname(path), { recursive: true });

  const draft = `${path}.${process.pid}`;
  const fd = openSync(draft, 'w');

  writeSync(fd, JSON.stringify({ ...who, startedAt: new Date().toISOString() }));
  closeSync(fd);

  try {
    linkSync(draft, path);

    return true;
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === 'EEXIST') return false;

    throw error;
  } finally {
    unlinkSync(draft);
  }
}

/**
 * Move a dead holder's lock aside. Renamed before it is removed, so of two
 * gates taking over the same stale lock only one succeeds; the other finds it
 * gone and goes back to taking it.
 *
 * @param {string} path
 * @param {Holder | undefined} holder
 * @param {(line: string) => void} write
 * @returns {void}
 */
function takeOver(path, holder, write) {
  const aside = `${path}.stale-${process.pid}`;

  try {
    renameSync(path, aside);
  } catch {
    return;
  }

  unlinkSync(aside);
  write(
    holder === undefined
      ? `gate: took over an unreadable lock at ${path}\n`
      : `gate: took over a stale lock — the ${holder.tier} gate in ` +
          `${holder.checkout} (pid ${holder.pid}) is gone\n`,
  );
}

/** Sleep without spinning: the thread blocks until the timeout.
 *  @param {number} ms */
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/**
 * Remove the lock if this process holds it. Safe to call more than once, and
 * from any exit path.
 *
 * @param {string} path
 * @returns {void}
 */
export function release(path) {
  if (readHolder(path)?.pid !== process.pid) return;

  try {
    unlinkSync(path);
  } catch {
    // Already gone.
  }
}

/**
 * Take the machine's gate lock, waiting for it unless `wait` is false.
 *
 * Polls every `pollMs`, blocked rather than spinning in between. A holder whose
 * pid is gone is stale and is taken over, with a line saying so.
 *
 * @param {object} options
 * @param {string} options.path
 * @param {string} options.checkout
 * @param {string} options.tier
 * @param {boolean} options.wait
 * @param {number} [options.pollMs]
 * @param {(line: string) => void} [options.write]
 * @returns {{ ok: true, waitedMs: number } | { ok: false, sentence: string }}
 */
export function acquire({
  path,
  checkout,
  tier,
  wait,
  pollMs = 1000,
  write = (line) => process.stdout.write(line),
}) {
  const started = Date.now();
  let told = false;

  for (;;) {
    if (take(path, { pid: process.pid, checkout, tier })) {
      return { ok: true, waitedMs: Date.now() - started };
    }

    const holder = readHolder(path);

    if (holder === null) continue;

    if (holder === undefined || !alive(holder.pid)) {
      takeOver(path, holder, write);
      continue;
    }

    const sentence = heldSentence(holder, Date.now());

    if (!wait) return { ok: false, sentence };

    if (!told) write(`${sentence}; this one waits its turn.\n`);
    told = true;
    sleep(pollMs);
  }
}

/** The signals a person or a supervisor stops a gate with. */
export const STOP_SIGNALS = /** @type {const} */ (['SIGINT', 'SIGTERM', 'SIGHUP']);

/**
 * The exit code of a step a stop signal ended, as the signal would have made
 * it (`128 + n`), or `undefined`. Either the step died of the signal, or a shell
 * or package manager in between exited with that code for it.
 *
 * @param {{ signal: NodeJS.Signals | null, status: number | null }} result
 * @returns {number | undefined}
 */
export function stopSignalExit(result) {
  for (const signal of STOP_SIGNALS) {
    const code = 128 + constants.signals[signal];

    if (result.signal === signal || result.status === code) return code;
  }

  return undefined;
}

/**
 * Release the lock on every way out: a normal end, `process.exit`, and the stop
 * signals, after which the process exits as the signal would have made it.
 *
 * A listener defers a signal until the event loop is free, and the runner's
 * checks block it (`spawnSync`), so the runner also stops at a check a signal
 * killed — see `run.mjs`.
 *
 * @param {string} path
 * @returns {void}
 */
export function releaseOnExit(path) {
  process.once('exit', () => release(path));

  for (const signal of STOP_SIGNALS) {
    process.once(signal, () => {
      release(path);
      process.exit(128 + /** @type {number} */ (constants.signals[signal]));
    });
  }
}
