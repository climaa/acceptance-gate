// @ts-check
//
// Runs the visual-diff CLI inside the pinned Playwright container, from the host.
//
// Exists because `accept` has no host guard (see packages/visual-diff/README.md →
// "The host guard"): a bare-metal accept succeeds, silently writes baselines rendered
// by the host's own font/graphics stack, and the corruption only surfaces when CI's
// guard trips on the next `check`. Making the container the path of least resistance —
// `pnpm visual-diff:accept` routes here — is the mitigation; the CLI itself stays
// guard-free for the reason the README gives (an accept produces the new baseline, so
// there is nothing yet to be comparable to).
//
//   node scripts/visual-diff-container.mjs [check|accept] [--filter <substring>] ...
//
// Every argument is passed to the CLI verbatim — argument validation is cli.mjs's job,
// and a second parser here would be a second grammar that can drift. The wrapper only
// peeks at the command name to know whether a Storybook build must already exist.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { EXIT, HOST, PATHS } from '../packages/visual-diff/src/policy.mjs';

/** The platform the committed corpus was captured on — `__baselines__/BASELINE_ENV.json`
 *  stamps `linux`/`arm64`, and CI captures on an arm64 runner. Forced explicitly so an
 *  amd64 host cannot silently pull the amd64 build of the image and accept baselines the
 *  guard would reject on every subsequent CI run. (On amd64 that means qemu emulation —
 *  slow, and Chromium may not survive it — but the failure is loud, not a corrupt corpus.) */
const CORPUS_PLATFORM = 'linux/arm64';

/** Only the package's own environment flows into the container. A prefix match rather
 *  than a list of names, so a variable added to the CLI later doesn't need a second
 *  registration here. */
const FORWARDED_ENV_PREFIX = 'VISUAL_DIFF_';

/** Repo root: this file lives in `scripts/`, one level down. Resolved from the module
 *  URL rather than cwd, so the mount is right whichever directory pnpm ran this from. */
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Commands that read `storybook-static`. `promote` (a data-directory operation) does
 *  not, so it is deliberately absent — requiring a build it never reads would block it.
 *  @type {readonly string[]} */
const NEEDS_STORYBOOK = ['check', 'accept'];

/** The command the CLI will run: the first non-flag argument, or cli.mjs's own default.
 *  @param {readonly string[]} argv @returns {string} */
function commandOf(argv) {
  return argv.find((argument) => !argument.startsWith('-')) ?? 'check';
}

/** @param {readonly string[]} argv @returns {number} */
export function run(argv) {
  if (
    NEEDS_STORYBOOK.includes(commandOf(argv)) &&
    !existsSync(join(REPO_ROOT, PATHS.storybookStatic))
  ) {
    process.stderr.write(
      `${PATHS.storybookStatic} not found — build it on the host first:\n\n` +
        `  pnpm --filter @gate/storybook build\n`,
    );
    return EXIT.broken;
  }

  const forwarded = Object.entries(process.env)
    .filter(([name]) => name.startsWith(FORWARDED_ENV_PREFIX))
    .flatMap(([name, value]) => ['-e', `${name}=${value}`]);

  const result = spawnSync(
    'docker',
    [
      'run',
      '--rm',
      // Chromium crashes against Docker's default 64MB /dev/shm.
      '--ipc=host',
      `--platform=${CORPUS_PLATFORM}`,
      '-v',
      `${REPO_ROOT}:/repo`,
      '-w',
      '/repo',
      // The browser baked into the image, not the host's cache (wrong OS's build).
      '-e',
      'PLAYWRIGHT_BROWSERS_PATH=/ms-playwright',
      ...forwarded,
      HOST.image,
      'node',
      'packages/visual-diff/src/cli.mjs',
      ...argv,
    ],
    { cwd: REPO_ROOT, stdio: 'inherit' },
  );

  if (result.error) {
    process.stderr.write(
      `could not run docker (${result.error.message}) — the pinned container ` +
        `(${HOST.image}) is how baselines stay comparable across machines, so ` +
        `install/start Docker rather than falling back to a bare-metal run\n`,
    );
    return EXIT.broken;
  }

  return result.status ?? EXIT.broken;
}

// Only when this file *is* the process — same pattern as cli.mjs, so a test can import
// `run` without spawning a container.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = run(process.argv.slice(2));
}
