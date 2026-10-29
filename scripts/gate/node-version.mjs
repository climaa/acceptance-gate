// @ts-check
//
// The Node the gate runs on, against the Node the repository declares.
//
// WHY A REFUSAL AND NOT A WARNING. The receipt records `process.version`, and for
// a while that was all: a child project found a receipt saying `node v22.14.0`
// while its `.nvmrc` said 22.23.4, and nothing had stopped it. The
// `Intl` and time-zone data and the V8 behind every check belong to the runtime,
// so a receipt written on an undeclared Node vouches for less than it says. A
// warning would be scrolled past on the push it is printed on, and the receipt
// read afterwards would show the run was worthless only once it is relied on.
//
// MAJOR.MINOR, NOT THE PATCH. Patch releases do not move the ICU version; minors
// have. `.nvmrc` pins the patch for `nvm use`, the comparison does not.
//
// THE HOST'S NODE ONLY. The full tier's visual-diff runs in a container with its
// own pinned Node; this check cannot see that one and does not try.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { withoutAmbientGit } from './git-env.mjs';

/**
 * @typedef {{ ok: true, declared: string, running: string }
 *   | { ok: false, message: string }} Verdict
 */

/** `22.23.4`, `v22.23.4`, `22.23` → `22.23`. Anything else → `null`: `22`
 *  alone, `lts/*`, a blank file. */
const MAJOR_MINOR = /^v?(\d+\.\d+)(?:\.\d+)?$/;

/** @param {string} version @returns {string | null} */
function majorMinorOf(version) {
  const match = MAJOR_MINOR.exec(version.trim());

  return match === null ? null : /** @type {string} */ (match[1]);
}

/**
 * The verdict, as a pure function of the two strings, so it can be tested
 * without a Node to switch to.
 *
 * @param {string | null} nvmrc  `.nvmrc`'s text, or `null` when the file is missing.
 * @param {string} processVersion  `process.version`, e.g. `v22.23.4`.
 * @param {string} [at]  The `--at` revision `.nvmrc` was read from, if any.
 * @returns {Verdict}
 */
export function compareNodeVersion(nvmrc, processVersion, at) {
  if (nvmrc === null && at !== undefined) {
    return {
      ok: false,
      message:
        `✗ gate refused: cannot read .nvmrc at ${at}: the revision is unknown or ` +
        `holds no .nvmrc\n` +
        `  running ${processVersion}. Check the revision; the gate does not guess.\n`,
    };
  }

  if (nvmrc === null) {
    return {
      ok: false,
      message:
        `✗ gate refused: .nvmrc is missing, so there is no declared Node to run on\n` +
        `  running ${processVersion}. Restore .nvmrc; the gate does not guess.\n`,
    };
  }

  const declared = majorMinorOf(nvmrc);

  if (declared === null) {
    return {
      ok: false,
      message:
        `✗ gate refused: .nvmrc says \`${nvmrc.trim()}\`, which is not a major.minor ` +
        `the gate can compare against\n` +
        `  running ${processVersion}. Write the version as \`major.minor.patch\`.\n`,
    };
  }

  const running = majorMinorOf(processVersion);

  if (running !== declared) {
    return {
      ok: false,
      message:
        `✗ gate refused: running Node ${processVersion}, .nvmrc declares ` +
        `${nvmrc.trim()} (major.minor must match)\n` +
        `  Switch to the Node in .nvmrc (\`nvm use\` or \`fnm use\`). The runtime's Intl data and V8 ` +
        `are part of what a receipt vouches for, so a run on another Node proves less.\n`,
    };
  }

  return { ok: true, declared, running: /** @type {string} */ (running) };
}

/** `.nvmrc`'s text, or `null` when it cannot be read. Unreadable is reported as
 *  missing on purpose: the gate must not run on a guess either way.
 *
 *  With `at`, the `.nvmrc` committed at that revision, not the checkout's: a
 *  receipt vouches for a tree, so the Node it is checked against is the one that
 *  tree declares. A branch that moves Node is pushed from a host sitting on
 *  `main` (Sandcastle does exactly that), and the checkout's file would judge it
 *  by the old version.
 *  @param {string} root @param {string} [at] @returns {string | null} */
export function readNvmrc(root, at) {
  if (at !== undefined) {
    const shown = spawnSync('git', ['show', `${at}:.nvmrc`], {
      cwd: root,
      encoding: 'utf8',
      env: withoutAmbientGit(),
    });

    return shown.status === 0 ? shown.stdout : null;
  }

  try {
    return readFileSync(join(root, '.nvmrc'), 'utf8');
  } catch {
    return null;
  }
}
