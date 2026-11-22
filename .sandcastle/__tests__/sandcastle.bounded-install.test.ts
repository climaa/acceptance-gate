import { read, stripComments } from './helpers';
import { PNPM_INSTALL_HOOK, WORKTREE_PNPM_ENV } from '../sandcastle-sandbox-hooks.mts';

/**
 * A worktree sandbox's startup `pnpm install` once stalled for over an hour on a
 * slow registry: no sockets, no writes, its 600 s `timeoutMs` long past. The SDK
 * races the hook against a timeout, but the timeout waits on a `docker exec` it
 * cannot interrupt, so the run waited with it. The install therefore bounds
 * itself, and fewer parallel fetches keep a slow registry from tripping it.
 */

const LIMIT = /^CI=true timeout -k (\d+) (\d+) pnpm install$/;

describe('the worktree sandbox install bounds itself', () => {
  it('runs pnpm install under a timeout with a kill-after', () => {
    // Act
    const match = LIMIT.exec(PNPM_INSTALL_HOOK.command);

    // Assert
    expect(match).not.toBeNull();
  });

  it('ends, kill-after included, before the hook timeout the SDK cannot enforce', () => {
    // Arrange
    const [, killAfter, limit] = LIMIT.exec(PNPM_INSTALL_HOOK.command) ?? [];

    // Act
    const worstCaseMs = (Number(limit) + Number(killAfter)) * 1000;

    // Assert
    expect(worstCaseMs).toBeLessThan(PNPM_INSTALL_HOOK.timeoutMs);
  });

  it('leaves a slow but working install the time it took: 7 minutes at 4 fetches', () => {
    // Arrange
    const [, , limit] = LIMIT.exec(PNPM_INSTALL_HOOK.command) ?? [];

    // Assert
    expect(Number(limit)).toBeGreaterThanOrEqual(2 * 7 * 60);
  });
});

describe('the worktree sandbox fetches four packages at a time', () => {
  it('sets network concurrency through the pnpm_config_ prefix pnpm 11 reads', () => {
    // Assert
    expect(WORKTREE_PNPM_ENV).toEqual({ pnpm_config_network_concurrency: '4' });
  });

  it('passes it to the worktree sandbox, so the agent’s own installs get it too', () => {
    // Arrange
    const source = stripComments(read('sandcastle-worktree-sandbox.mts'));

    // Assert
    expect(source).toMatch(/env:\s*\{[^}]*\.\.\.WORKTREE_PNPM_ENV/);
  });
});
