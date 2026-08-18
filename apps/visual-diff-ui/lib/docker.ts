import { execFileSync } from 'node:child_process';
import { HOST } from '@gate/visual-diff/policy';

/**
 * The pinned container, driven by this console rather than described to a
 * reviewer.
 *
 * `check` guards its host before it takes a shot, so a capture from a
 * developer's machine is refused — and the answer the differ's README gives is a
 * `docker run` to paste. Pasting is what this console exists to avoid, so it
 * runs that container itself: the button starts a job, the job starts the
 * container, and the log streams back into the panel.
 *
 * The recipe is the README's ("Running the pinned container locally"), as argv
 * rather than as prose. `--ipc=host` keeps Chromium off Docker's 64MB
 * `/dev/shm`; `PLAYWRIGHT_BROWSERS_PATH` points at the browser baked into the
 * image rather than a host cache that is the wrong OS's build; and no
 * `pnpm install` happens inside, because every dependency the differ touches is
 * pure JS and the host's `node_modules` rides in on the mount.
 */

/** Where the two mounts land inside the container. The data directory gets its
 *  own rather than being addressed through the repo mount: `VISUAL_DIFF_DATA_DIR`
 *  may point anywhere, and a path that only works when it happens to sit inside
 *  the checkout is a trap that springs the first time it does not. */
export const REPO_MOUNT = '/repo';
export const DATA_MOUNT = '/data';

/** How long the daemon has to answer before this console calls it down. A
 *  stopped Docker Desktop fails fast; a starting one can hang, and the panel
 *  asking the question is waiting on the answer. */
const PROBE_TIMEOUT_MS = 3_000;

/**
 * Whether a container could be started right now.
 *
 * `docker info` rather than `docker --version`: the version answers from the CLI
 * binary alone and says nothing about whether the daemon behind it is up, which
 * is the entire question — a machine with Docker installed and Docker Desktop
 * quit is exactly the case the panel needs to name.
 */
export function dockerAvailable(): boolean {
  try {
    execFileSync('docker', ['info', '--format', '{{.ServerVersion}}'], {
      stdio: ['ignore', 'ignore', 'ignore'],
      timeout: PROBE_TIMEOUT_MS,
    });

    return true;
  } catch {
    return false;
  }
}

/**
 * The argv that runs `command` inside the pinned image, with the checkout and
 * the data directory mounted.
 *
 * Returned as an array and never as a string: a repo path with a space in it is
 * a shell-quoting bug waiting to happen, and `spawn` without a shell cannot have
 * one.
 */
export function containerArgv(
  repoRoot: string,
  dataDir: string,
  command: readonly string[],
): string[] {
  return [
    'run',
    '--rm',
    '--ipc=host',
    '-v',
    `${repoRoot}:${REPO_MOUNT}`,
    '-v',
    `${dataDir}:${DATA_MOUNT}`,
    '-w',
    REPO_MOUNT,
    '-e',
    'PLAYWRIGHT_BROWSERS_PATH=/ms-playwright',
    HOST.image,
    ...command,
  ];
}
