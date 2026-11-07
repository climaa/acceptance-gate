// Preflight: refuse to start without a reachable Docker daemon.
//
// On 2026-10-31 a run with Docker Desktop stopped printed a reap warning, then
// "image sandcastle:<repo> missing or has no pnpm — building it…", then died
// inside ensureImageFreshness()'s `docker build` with a Node stack trace. The
// cause sat three lines above the trace, and the build message blamed the
// image. `docker info` is the cheapest call that needs the daemon, so main.mts
// asks it before reapExitedContainers() and ensureImageFreshness() and, when
// it fails, prints one sentence and exits 1.

import { execFileSync } from 'node:child_process';

/** Runs a command; throws when it cannot be spawned or exits non-zero. */
export type Exec = (file: string, args: string[]) => void;

const DAEMON_DOWN =
  "Docker isn't running: start Docker Desktop (or the Docker daemon) and rerun `pnpm sandcastle`.";

const NOT_ON_PATH =
  '`docker` was not found on PATH: install Docker, or launch from a shell ' +
  'whose PATH includes it, and rerun `pnpm sandcastle`.';

const defaultExec: Exec = (file, args) => {
  execFileSync(file, args, { stdio: 'ignore' });
};

/** The sentence to refuse with, or `null` when the daemon answers. */
export function dockerRefusal(exec: Exec = defaultExec): string | null {
  try {
    exec('docker', ['info']);
    return null;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ENOENT' ? NOT_ON_PATH : DAEMON_DOWN;
  }
}

export interface RefuseWithoutDockerOptions {
  exec?: Exec;
  logger?: Pick<Console, 'error'>;
  exit?: (code: number) => void;
}

/** Prints the refusal and exits 1 when Docker is unreachable; else returns. */
export function refuseWithoutDocker(options: RefuseWithoutDockerOptions = {}): void {
  const { exec = defaultExec, logger = console, exit = process.exit } = options;
  const refusal = dockerRefusal(exec);
  if (refusal === null) return;
  logger.error(refusal);
  exit(1);
}
