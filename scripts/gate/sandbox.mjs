// @ts-check
//
// The gate inside the Sandcastle sandbox.
//
// The sandbox image has no browser, so `e2e` fails there on every run, whatever
// the change. An implementer spent minutes on each run waiting for that red and
// learned nothing from it, while the host push ran the whole gate again anyway.
// So in the sandbox the gate runs every check but `e2e`, says in one line why,
// and writes NO RECEIPT: a receipt says a tree passed the gate, and a later push
// that read one for a tree whose e2e never ran would wave it through unchecked.
//
// The sandbox says where it is through `SANDCASTLE_SANDBOX=1`, which
// `.sandcastle/sandcastle-sandbox-hooks.mts` exports into the agent's shell.
// The host never sets it, so the host gate is the one it always was.

/** The variable the sandbox hooks export. */
export const SANDBOX_ENV = 'SANDCASTLE_SANDBOX';

/** The checks that cannot run in the sandbox, by name. */
export const SANDBOX_SKIPS = ['e2e'];

/** The one line the sandbox gate prints in place of the checks it skips. */
export const SANDBOX_SKIP_LINE =
  `gate: e2e skipped — this Sandcastle sandbox has no browser; ` +
  `e2e runs on the host push, which this sandbox cannot do. No receipt is written.`;

/** @param {NodeJS.ProcessEnv} env @returns {boolean} */
export const inSandbox = (env) => env[SANDBOX_ENV] === '1';

/**
 * What a gate run in this environment runs, and whether it may leave a receipt.
 *
 * @param {readonly import('./manifest.mjs').Check[]} checks
 * @param {NodeJS.ProcessEnv} env
 * @returns {{ checks: readonly import('./manifest.mjs').Check[], receipt: boolean, note?: string }}
 */
export function planFor(checks, env) {
  if (!inSandbox(env)) return { checks, receipt: true };

  return {
    checks: checks.filter((check) => !SANDBOX_SKIPS.includes(check.name)),
    receipt: false,
    note: SANDBOX_SKIP_LINE,
  };
}
