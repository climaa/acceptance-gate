import { read } from './helpers';
import { dockerRefusal, refuseWithoutDocker } from '../sandcastle-docker-preflight.mts';

// On 2026-10-31 a run with Docker Desktop stopped printed a reap warning, then
// "image … missing or has no pnpm — building it…", then died inside
// `docker build` with a Node stack trace. The stopped daemon looked like a bad
// image. The preflight asks `docker info` first and refuses in one sentence.
describe('sandcastle docker preflight', () => {
  it('passes when `docker info` succeeds', () => {
    // Arrange
    const exec = () => undefined;

    // Act
    const refusal = dockerRefusal(exec);

    // Assert
    expect(refusal).toBeNull();
  });

  it('refuses with the start-the-daemon sentence when `docker info` fails', () => {
    // Arrange
    const exec = () => {
      throw Object.assign(new Error('Command failed: docker info'), { status: 1 });
    };

    // Act
    const refusal = dockerRefusal(exec);

    // Assert
    expect(refusal).toBe(
      "Docker isn't running: start Docker Desktop (or the Docker daemon) and rerun `pnpm sandcastle`.",
    );
  });

  it('refuses with its own sentence when `docker` is not on PATH', () => {
    // Arrange
    const exec = () => {
      throw Object.assign(new Error('spawnSync docker ENOENT'), { code: 'ENOENT' });
    };

    // Act
    const refusal = dockerRefusal(exec);

    // Assert
    expect(refusal).toBe(
      '`docker` was not found on PATH: install Docker, or launch from a shell whose PATH includes it, and rerun `pnpm sandcastle`.',
    );
  });

  it('asks `docker info`, nothing heavier', () => {
    // Arrange
    const calls: string[][] = [];
    const exec = (file: string, args: string[]) => {
      calls.push([file, ...args]);
    };

    // Act
    dockerRefusal(exec);

    // Assert
    expect(calls).toEqual([['docker', 'info']]);
  });

  it('prints the sentence and exits 1, without a stack trace', () => {
    // Arrange
    const errors: string[] = [];
    let exitCode: number | undefined;
    const exec = () => {
      throw Object.assign(new Error('Command failed: docker info'), { status: 1 });
    };

    // Act
    refuseWithoutDocker({
      exec,
      logger: { error: (line: string) => errors.push(line) },
      exit: (code: number) => {
        exitCode = code;
      },
    });

    // Assert
    expect(errors).toEqual([
      "Docker isn't running: start Docker Desktop (or the Docker daemon) and rerun `pnpm sandcastle`.",
    ]);
    expect(exitCode).toBe(1);
  });

  it('main.mts runs the preflight before reaping containers or checking the image', () => {
    // Arrange
    const main = read('main.mts')
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('//'))
      .join('\n');

    // Act
    const preflight = main.indexOf('refuseWithoutDocker()');
    const reap = main.indexOf('reapExitedContainers()');
    const freshness = main.indexOf('ensureImageFreshness()');

    // Assert
    expect(preflight).toBeGreaterThan(-1);
    expect(preflight).toBeLessThan(reap);
    expect(preflight).toBeLessThan(freshness);
  });
});
