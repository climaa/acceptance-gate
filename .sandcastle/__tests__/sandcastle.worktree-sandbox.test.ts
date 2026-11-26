import { execSync } from 'node:child_process';
import * as sandcastle from '@ai-hero/sandcastle';
import { docker } from '@ai-hero/sandcastle/sandboxes/docker';
import { WORKTREE_PNPM_ENV, worktreeHooks } from '../sandcastle-sandbox-hooks.mts';
import { SANDBOX_GIT_SETUP_TIMEOUT_MS } from '../sandcastle-variables.mts';
import { createWorktreeSandbox } from '../sandcastle-worktree-sandbox.mts';

/**
 * sandcastle-worktree-sandbox.mts forks the worktree sandbox both the issue
 * pipeline and the stranded rescue run in: fetch the base branch, prune stale
 * worktree metadata, then create the sandbox. git (execSync), the sandcastle
 * package and its docker provider are mocked, and the config is pinned so the
 * host's `.env` cannot change the turbo values; withRetry and
 * isRetryableGitError stay real, so what is asserted is the order of the steps,
 * what the sandbox is created with, and which failures are retried.
 */

vi.mock('node:child_process', () => ({ execSync: vi.fn() }));
vi.mock('@ai-hero/sandcastle', () => ({ createSandbox: vi.fn() }));
vi.mock('@ai-hero/sandcastle/sandboxes/docker', () => ({
  docker: vi.fn((options: unknown) => ({ provider: 'docker', options })),
}));
vi.mock('../sandcastle-config.mts', () => ({
  BASE_BRANCH: 'main',
  turboToken: 'tok-123',
  turboTeam: 'team-abc',
}));

const BRANCH = 'sandcastle/issue-42-add-the-thing';
const FETCH = 'git fetch origin main';
const PRUNE = 'git worktree prune';

function gitError(stderr: string | undefined, message = 'Command failed'): Error {
  return Object.assign(new Error(message), stderr === undefined ? {} : { stderr });
}

function commands(): string[] {
  return vi.mocked(execSync).mock.calls.map(([command]) => String(command));
}

// withRetry waits 3s, 6s, … between attempts; drive those waits on fake time.
async function settle<T>(promise: Promise<T>): Promise<PromiseSettledResult<T>> {
  const settled = Promise.allSettled([promise]).then(([result]) => result);
  await vi.runAllTimersAsync();
  return settled;
}

describe('createWorktreeSandbox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.mocked(execSync).mockReturnValue('');
    vi.mocked(sandcastle.createSandbox).mockResolvedValue({ id: 'sandbox' } as never);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('fetches the base branch, prunes stale worktrees, then creates the sandbox', async () => {
    // Act
    const sandbox = await createWorktreeSandbox(BRANCH);

    // Assert
    expect(sandbox).toEqual({ id: 'sandbox' });
    expect(commands()).toEqual([FETCH, PRUNE]);
    expect(execSync).toHaveBeenNthCalledWith(1, FETCH, {
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    });
    expect(execSync).toHaveBeenNthCalledWith(2, PRUNE, { stdio: 'inherit' });
    expect(sandcastle.createSandbox).toHaveBeenCalledOnce();
    const [pruneOrder] = vi.mocked(execSync).mock.invocationCallOrder.slice(1);
    const [createOrder] = vi.mocked(sandcastle.createSandbox).mock.invocationCallOrder;
    expect(pruneOrder).toBeLessThan(createOrder ?? 0);
  });

  it('creates the sandbox on the branch, off origin/main, with the worktree hooks and timeout', async () => {
    // Act
    await createWorktreeSandbox(BRANCH);

    // Assert
    expect(sandcastle.createSandbox).toHaveBeenCalledWith({
      branch: BRANCH,
      baseBranch: 'origin/main',
      sandbox: vi.mocked(docker).mock.results[0]?.value,
      timeouts: { gitSetupMs: SANDBOX_GIT_SETUP_TIMEOUT_MS },
      hooks: worktreeHooks,
    });
  });

  it('runs docker as the host user with the turbo cache and pnpm env', async () => {
    // Arrange
    vi.spyOn(process, 'getuid').mockReturnValue(501);
    vi.spyOn(process, 'getgid').mockReturnValue(20);

    // Act
    await createWorktreeSandbox(BRANCH);

    // Assert
    expect(docker).toHaveBeenCalledWith({
      containerUid: 501,
      containerGid: 20,
      env: expect.objectContaining({
        TURBO_TOKEN: 'tok-123',
        TURBO_TEAM: 'team-abc',
        TURBO_CACHE_DIR: expect.any(String),
        ...WORKTREE_PNPM_ENV,
      }),
    });
  });

  it('falls back to uid and gid 1000 where the platform has no getuid/getgid', async () => {
    // Arrange
    const { getuid, getgid } = process;
    Object.assign(process, { getuid: undefined, getgid: undefined });

    // Act
    try {
      await createWorktreeSandbox(BRANCH);
    } finally {
      Object.assign(process, { getuid, getgid });
    }

    // Assert
    expect(docker).toHaveBeenCalledWith(
      expect.objectContaining({ containerUid: 1000, containerGid: 1000 }),
    );
  });

  it('retries a transient fetch failure, warning with git’s trimmed stderr', async () => {
    // Arrange
    vi.mocked(execSync).mockImplementationOnce(() => {
      throw gitError('  fatal: unable to access github.com: Connection reset  \n');
    });

    // Act
    const result = await settle(createWorktreeSandbox(BRANCH));

    // Assert
    expect(result.status).toBe('fulfilled');
    expect(commands()).toEqual([FETCH, FETCH, PRUNE]);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        'attempt 1/3 failed (fatal: unable to access github.com: Connection reset)',
      ),
    );
    expect(sandcastle.createSandbox).toHaveBeenCalledOnce();
  });

  it('falls back to the error message when a failed fetch printed no stderr', async () => {
    // Arrange
    vi.mocked(execSync).mockImplementation(() => {
      throw gitError('   ', 'Command failed: git fetch origin main');
    });

    // Act
    const result = await settle(createWorktreeSandbox(BRANCH));

    // Assert
    expect(result).toMatchObject({
      status: 'rejected',
      reason: new Error('Command failed: git fetch origin main'),
    });
    expect(commands()).toEqual([FETCH, FETCH, FETCH]);
    expect(sandcastle.createSandbox).not.toHaveBeenCalled();
  });

  it('gives up at once on a permanent fetch failure, never pruning or creating', async () => {
    // Arrange
    vi.mocked(execSync).mockImplementation(() => {
      throw gitError('remote: Permission denied to climaa/acceptance-gate.');
    });

    // Act
    const result = await settle(createWorktreeSandbox(BRANCH));

    // Assert
    expect(result).toMatchObject({
      status: 'rejected',
      reason: new Error('remote: Permission denied to climaa/acceptance-gate.'),
    });
    expect(commands()).toEqual([FETCH]);
    expect(console.warn).not.toHaveBeenCalled();
    expect(sandcastle.createSandbox).not.toHaveBeenCalled();
  });

  it('lets a failing worktree prune propagate without creating the sandbox', async () => {
    // Arrange
    vi.mocked(execSync)
      .mockReturnValueOnce('')
      .mockImplementationOnce(() => {
        throw new Error('prune failed');
      });

    // Act
    const result = await settle(createWorktreeSandbox(BRANCH));

    // Assert
    expect(result).toMatchObject({
      status: 'rejected',
      reason: new Error('prune failed'),
    });
    expect(sandcastle.createSandbox).not.toHaveBeenCalled();
  });

  it('retries a transient sandbox creation failure and returns the sandbox', async () => {
    // Arrange
    vi.mocked(sandcastle.createSandbox)
      .mockRejectedValueOnce(new Error('git setup timed out'))
      .mockResolvedValueOnce({ id: 'second' } as never);

    // Act
    const result = await settle(createWorktreeSandbox(BRANCH));

    // Assert
    expect(result).toEqual({ status: 'fulfilled', value: { id: 'second' } });
    expect(sandcastle.createSandbox).toHaveBeenCalledTimes(2);
    expect(commands()).toEqual([FETCH, PRUNE]);
  });

  it('rejects with the last error once sandbox creation fails three times', async () => {
    // Arrange
    vi.mocked(sandcastle.createSandbox)
      .mockRejectedValueOnce(new Error('timeout 1'))
      .mockRejectedValueOnce(new Error('timeout 2'))
      .mockRejectedValueOnce(new Error('timeout 3'));

    // Act
    const result = await settle(createWorktreeSandbox(BRANCH));

    // Assert
    expect(result).toMatchObject({ status: 'rejected', reason: new Error('timeout 3') });
    expect(sandcastle.createSandbox).toHaveBeenCalledTimes(3);
  });

  it('does not retry a sandbox creation that fails permanently', async () => {
    // Arrange
    vi.mocked(sandcastle.createSandbox).mockRejectedValueOnce(
      new Error('fatal: repository not found'),
    );

    // Act
    const result = await settle(createWorktreeSandbox(BRANCH));

    // Assert
    expect(result).toMatchObject({
      status: 'rejected',
      reason: new Error('fatal: repository not found'),
    });
    expect(sandcastle.createSandbox).toHaveBeenCalledOnce();
  });
});
