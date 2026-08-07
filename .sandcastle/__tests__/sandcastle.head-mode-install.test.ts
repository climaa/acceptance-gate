import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  GH_AUTH_SETUP_HOOK,
  PNPM_INSTALL_HOOK,
  type SandboxMount,
  headHooks,
  hooksFor,
  worktreeHooks,
} from '../sandcastle-sandbox-hooks.mts';

const ROOT = path.resolve(__dirname, '../..');
const SANDCASTLE = path.join(ROOT, '.sandcastle');

function read(file: string) {
  return fs.readFileSync(path.join(SANDCASTLE, file), 'utf8');
}

function stripComments(source: string) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

/**
 * REAL unit tests, not source-text assertions — sandcastle-sandbox-hooks.mts
 * imports nothing from this directory precisely so it can be loaded without
 * dragging in sandcastle-config.mts's import-time side effects (same reasoning
 * as sandcastle-model-overrides.mts and sandcastle-turbo-cache.mts).
 *
 * What is being protected: one shared `hooks` const ran `CI=true pnpm install`
 * on EVERY sandbox, including the two head-mode ones (planner, merger) whose
 * mount is the HOST checkout — stamping the container's pnpm store path into
 * the developer's node_modules, which leaves the host's next non-TTY pnpm
 * command dead with ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY. The full
 * failure chain is documented atop sandcastle-sandbox-hooks.mts.
 *
 * The credential helper's own contract lives in
 * sandcastle.git-credential-helper.test.ts; what is asserted here is only that
 * dropping the install did not drop it too.
 */

const commandsFor = (mount: SandboxMount) =>
  hooksFor(mount).sandbox.onSandboxReady.map((h) => h.command);

describe('hooksFor — head-mode sandboxes never install into the host checkout', () => {
  it('omits the pnpm install hook in head mode', () => {
    // Arrange & Act
    const commands = commandsFor('head');

    // Assert
    expect(commands).not.toContain(PNPM_INSTALL_HOOK.command);
  });

  it('runs no mutating pnpm command at all in head mode', () => {
    // A future hook must not smuggle the install back in under another name
    // (`pnpm i`, `pnpm install --frozen-lockfile`, …). `--lockfile-only` is the
    // one documented exemption: it writes pnpm-lock.yaml, never node_modules.
    // Arrange & Act
    const commands = commandsFor('head');

    // Assert
    for (const command of commands) {
      expect(command.replace(/pnpm install --lockfile-only/g, '')).not.toMatch(
        /\bpnpm\s+(install|i|add|update|up|remove|rm|prune|dedupe)\b/,
      );
    }
  });

  it('keeps the pnpm install hook in worktree mode', () => {
    // A worktree is a fresh checkout with no node_modules of its own, so the
    // install is what makes the sandbox usable. Only the mount differs.
    // Arrange & Act
    const commands = commandsFor('worktree');

    // Assert
    expect(commands).toContain(PNPM_INSTALL_HOOK.command);
  });

  it.each(['head', 'worktree'] as const)(
    'wires the git credential helper in %s mode',
    (mount) => {
      // The merger is head-mode and still pushes, so dropping the install must
      // not drop this with it.
      // Arrange & Act
      const commands = commandsFor(mount);

      // Assert
      expect(commands).toContain(GH_AUTH_SETUP_HOOK.command);
    },
  );

  it('rejects an unrecognised mount rather than guessing', () => {
    // Arrange & Act & Assert — a typo must not silently pick the permissive
    // (installing) variant.
    expect(() => hooksFor('worktee' as never)).toThrow(/worktee/);
  });

  it('returns a fresh hook array per call so one sandbox cannot mutate another', () => {
    // Arrange
    const first = hooksFor('worktree');

    // Act
    first.sandbox.onSandboxReady.push({ command: 'rm -rf /', timeoutMs: 1 });

    // Assert
    expect(hooksFor('worktree').sandbox.onSandboxReady).not.toContainEqual(
      expect.objectContaining({ command: 'rm -rf /' }),
    );
  });
});

describe('the hooks themselves', () => {
  it('carries CI=true on the install so a no-TTY exec cannot hit pnpm’s confirm prompt', () => {
    expect(PNPM_INSTALL_HOOK.command).toMatch(/^CI=true /);
  });

  it('binds headHooks and worktreeHooks to the mount each is named for', () => {
    // Swapping these two is the same bug in a new place: headHooks =
    // hooksFor('worktree') would put the install straight back on the host.
    expect(headHooks).toEqual(hooksFor('head'));
    expect(worktreeHooks).toEqual(hooksFor('worktree'));
  });
});

/**
 * Wiring is what a unit test cannot see: which const each sandbox call site
 * actually passes. Getting THAT wrong is the whole bug, so it is asserted on
 * source text.
 */
describe('call-site wiring — head-mode sites take headHooks, worktree sites take worktreeHooks', () => {
  // sandcastle.run() with a bind-mount provider and no branchStrategy defaults
  // to `{ type: "head" }` in the SDK, which mounts hostRepoDir directly.
  const headSites = [
    ['main.mts', 'the planner'],
    ['sandcastle-merge.mts', 'the merger'],
  ] as const;

  // sandcastle.createSandbox({ branch, baseBranch }) mounts a git worktree
  // under .sandcastle/worktrees/, which has no node_modules of its own.
  const worktreeSites = [
    ['sandcastle-run-issue.mts', 'the per-issue pipeline'],
    ['sandcastle-stranded-branches.mts', 'the stranded-branch rescue'],
  ] as const;

  it.each(headSites)('%s (%s) passes headHooks', (file) => {
    expect(stripComments(read(file))).toMatch(/hooks:\s*headHooks|\bheadHooks,/);
  });

  it.each(headSites)('%s (%s) never references worktreeHooks', (file) => {
    expect(stripComments(read(file))).not.toMatch(/worktreeHooks/);
  });

  it.each(worktreeSites)('%s (%s) passes worktreeHooks', (file) => {
    expect(stripComments(read(file))).toMatch(/hooks:\s*worktreeHooks|\bworktreeHooks,/);
  });

  it.each([...headSites, ...worktreeSites])(
    '%s no longer imports the old undifferentiated `hooks` export',
    (file) => {
      // The old name carried no mount information, which is exactly how the
      // install reached a head-mounted host checkout unnoticed.
      expect(stripComments(read(file))).not.toMatch(
        /import\s*\{[^}]*\bhooks\b[^}]*\}\s*from/,
      );
    },
  );

  it('sandcastle-config.mts no longer defines sandbox hooks', () => {
    expect(stripComments(read('sandcastle-config.mts'))).not.toMatch(/onSandboxReady/);
  });
});
