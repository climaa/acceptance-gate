import { execFileSync, spawn } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  SANDBOX_MARK_HOOK,
  TURBO_CONCURRENCY_HOOK,
} from '../sandcastle-sandbox-hooks.mts';

// The SDK runs a sandbox's onSandboxReady hooks concurrently. Both of these
// rewrite ~/.bashrc; through one shared temp file the second `mv` failed with
// `cannot stat '/home/agent/.bashrc.tmp'` and took the sandbox down with it.
describe('sandcastle ~/.bashrc hooks run concurrently', () => {
  let home: string;
  let bin: string;

  // A slow `grep` holds each hook between reading ~/.bashrc and its `mv`, so
  // the two overlap on every run instead of only when the scheduler says so.
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'bashrc-race-'));
    bin = mkdtempSync(join(tmpdir(), 'bashrc-race-bin-'));
    mkdirSync(bin, { recursive: true });
    const realGrep = execFileSync('sh', ['-c', 'command -v grep'], {
      encoding: 'utf8',
    }).trim();
    writeFileSync(join(bin, 'grep'), `#!/bin/sh\nsleep 0.3\nexec ${realGrep} "$@"\n`);
    chmodSync(join(bin, 'grep'), 0o755);
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
    rmSync(bin, { recursive: true, force: true });
  });

  const run = (command: string) =>
    new Promise<number>((resolve) => {
      spawn('sh', ['-c', command], {
        env: { PATH: `${bin}:${process.env.PATH ?? ''}`, HOME: home },
        stdio: 'ignore',
      }).on('exit', (code) => resolve(code ?? -1));
    });

  it('both succeed and both exports survive, every time', async () => {
    for (let round = 0; round < 3; round++) {
      // Arrange
      writeFileSync(join(home, '.bashrc'), 'case $- in *i*) ;; *) return;; esac\n');

      // Act
      const codes = await Promise.all([
        run(TURBO_CONCURRENCY_HOOK.command),
        run(SANDBOX_MARK_HOOK.command),
      ]);

      // Assert
      expect(codes).toEqual([0, 0]);
      const bashrc = readFileSync(join(home, '.bashrc'), 'utf8');
      expect(bashrc).toMatch(/^export TURBO_CONCURRENCY=\d+$/m);
      expect(bashrc).toMatch(/^export SANDCASTLE_SANDBOX=1$/m);
      expect(readdirSync(home).sort()).toEqual(['.bashrc']);
    }
  }, 30_000);
});
