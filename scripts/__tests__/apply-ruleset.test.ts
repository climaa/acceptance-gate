import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from 'vitest';

/**
 * The ruleset applier: dry-run by default, `--apply` the only thing that writes.
 * It compares each `.github/rulesets/*.json` against the live ruleset of the same
 * name as a SUBSET (GitHub's own defaults are not drift), rules matched by type
 * rather than position, and exits 1 on drift so it can be run as a check.
 *
 * The script does all of that at import, with no exports, so each test imports it
 * fresh with `gh` (`execFileSync`) and the ruleset directory (`readdirSync`,
 * `readFileSync`) standing in for GitHub and the disk. Nothing reaches the network.
 */
const { execFileSync, readdirSync, readFileSync } = vi.hoisted(() => ({
  execFileSync: vi.fn(),
  readdirSync: vi.fn(),
  readFileSync: vi.fn(),
}));

vi.mock('node:child_process', () => ({ execFileSync }));
vi.mock('node:fs', () => ({ readdirSync, readFileSync }));

const SCRIPT = '../apply-ruleset.mjs';
const REPO = 'someone/fork';
const RULESET_ID = 42;

/** What `main.json` declares, trimmed to the shapes the comparison walks. */
const DESIRED = {
  name: 'main',
  target: 'branch',
  enforcement: 'active',
  bypass_actors: [],
  conditions: { ref_name: { include: ['~DEFAULT_BRANCH'], exclude: [] } },
  rules: [
    { type: 'deletion' },
    {
      type: 'pull_request',
      parameters: {
        required_approving_review_count: 0,
        allowed_merge_methods: ['squash'],
      },
    },
  ],
};

/**
 * The live ruleset as GitHub returns it when nothing has drifted: its own fields
 * added, `bypass_actors` omitted, a parameter default materialised, and the rules
 * in a different order from the file's.
 */
const liveMatching = () => ({
  id: RULESET_ID,
  source_type: 'Repository',
  name: 'main',
  target: 'branch',
  enforcement: 'active',
  conditions: { ref_name: { include: ['~DEFAULT_BRANCH'], exclude: [] } },
  rules: [
    {
      type: 'pull_request',
      parameters: {
        required_approving_review_count: 0,
        allowed_merge_methods: ['squash'],
        ignore_approvals_from_contributors: false,
      },
    },
    { type: 'deletion' },
  ],
});

type Live = ReturnType<typeof liveMatching> | Record<string, unknown>;

/** Routes each `gh` call the script makes; records the writes. */
function stubGitHub({ live = [liveMatching()] as Live[] } = {}) {
  execFileSync.mockImplementation((_cmd: string, args: string[]) => {
    if (args[0] === 'repo') return `${REPO}\n`;
    if (args.includes('--method')) return '';
    const path = args[1] ?? '';
    if (path.startsWith(`repos/${REPO}/rulesets?`)) {
      return JSON.stringify(live.map(({ id, name }) => ({ id, name })));
    }
    const byId = live.find((r) => path === `repos/${REPO}/rulesets/${r.id}`);
    if (byId) return JSON.stringify(byId);
    throw new Error(`unexpected gh call: ${args.join(' ')}`);
  });
}

const writes = () =>
  execFileSync.mock.calls
    .filter(([, args]) => (args as string[]).includes('--method'))
    .map(([, args, options]) => ({
      args: args as string[],
      body: JSON.parse((options as { input: string }).input),
    }));

describe('apply-ruleset', () => {
  const argv = process.argv;
  let log: MockInstance<typeof console.log>;
  let exit: MockInstance<typeof process.exit>;

  const output = () => log.mock.calls.map(([line]) => String(line)).join('\n');

  const run = async (...flags: string[]) => {
    process.argv = [...argv, ...flags];
    vi.resetModules();
    // A variable specifier: the script ships no types, and it is run here, not called.
    await import(/* @vite-ignore */ SCRIPT);
  };

  beforeEach(() => {
    readdirSync.mockReturnValue(['README.md', 'main.json']);
    readFileSync.mockReturnValue(JSON.stringify(DESIRED));
    log = vi.spyOn(console, 'log').mockImplementation(() => {});
    exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    process.argv = argv;
    vi.restoreAllMocks();
    execFileSync.mockReset();
    readdirSync.mockReset();
    readFileSync.mockReset();
  });

  it('reports nothing to do when the live ruleset satisfies what the file declares', async () => {
    stubGitHub();

    await run();

    expect(output()).toContain(
      '✓ main.json: live ruleset satisfies everything this file declares',
    );
    expect(output()).toContain('Nothing to do.');
    expect(exit).not.toHaveBeenCalled();
    expect(writes()).toEqual([]);
  });

  it('lists only its own repository rulesets, never inherited ones', async () => {
    stubGitHub();

    await run();

    const listCall = execFileSync.mock.calls.find(([, args]) =>
      (args as string[]).some((a) => a.includes('rulesets?')),
    );
    expect(listCall?.[1]).toEqual([
      'api',
      `repos/${REPO}/rulesets?includes_parents=false`,
      '--paginate',
    ]);
  });

  it('reads only the .json files of the ruleset directory', async () => {
    stubGitHub();

    await run();

    expect(readFileSync).toHaveBeenCalledTimes(1);
    expect(String(readFileSync.mock.calls[0]?.[0])).toMatch(
      /\.github[/\\]rulesets[/\\]main\.json$/,
    );
  });

  it('names a changed value, writes nothing and exits 1 on a dry run', async () => {
    const live = liveMatching();
    live.enforcement = 'evaluate';
    stubGitHub({ live: [live] });

    await run();

    expect(output()).toContain(
      `~ main.json: 1 mismatch(es) against ruleset ${RULESET_ID}`,
    );
    expect(output()).toContain('enforcement: want "active", live "evaluate"');
    expect(output()).toContain(
      '1 ruleset(s) would change. Re-run with --apply to write.',
    );
    expect(exit).toHaveBeenCalledWith(1);
    expect(writes()).toEqual([]);
  });

  it('reports a declared rule type the live ruleset no longer has', async () => {
    const live = liveMatching();
    live.rules = live.rules.filter((rule) => rule.type !== 'deletion');
    stubGitHub({ live: [live] });

    await run();

    expect(output()).toContain('rules.deletion: missing from the live ruleset');
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('reports an array whose length differs, by its path', async () => {
    const live = liveMatching();
    live.rules[0]!.parameters!.allowed_merge_methods = ['squash', 'merge'];
    stubGitHub({ live: [live] });

    await run();

    expect(output()).toContain('rules.pull_request.parameters.allowed_merge_methods');
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('reports a declared object the live ruleset has as something else', async () => {
    const live: Record<string, unknown> = { ...liveMatching(), conditions: null };
    stubGitHub({ live: [live] });

    await run();

    expect(output()).toMatch(/^ {4}conditions$/m);
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('treats a declared non-empty array the live ruleset omits as drift', async () => {
    readFileSync.mockReturnValue(
      JSON.stringify({
        ...DESIRED,
        bypass_actors: [{ actor_id: 5, actor_type: 'RepositoryRole' }],
      }),
    );
    stubGitHub();

    await run();

    expect(output()).toMatch(/^ {4}bypass_actors$/m);
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('reports a ruleset that does not exist yet without creating it on a dry run', async () => {
    stubGitHub({ live: [] });

    await run();

    expect(output()).toContain('+ main.json: no ruleset named "main" exists yet');
    expect(exit).toHaveBeenCalledWith(1);
    expect(writes()).toEqual([]);
  });

  it('updates the drifted ruleset in place by id under --apply', async () => {
    const live = liveMatching();
    live.enforcement = 'disabled';
    stubGitHub({ live: [live] });

    await run('--apply');

    expect(writes()).toEqual([
      {
        args: [
          'api',
          '--method',
          'PUT',
          `repos/${REPO}/rulesets/${RULESET_ID}`,
          '--input',
          '-',
        ],
        body: DESIRED,
      },
    ]);
    expect(output()).toContain(`applied: updated ruleset ${RULESET_ID} (main)`);
    expect(exit).not.toHaveBeenCalled();
  });

  it('creates a missing ruleset under --apply', async () => {
    stubGitHub({ live: [] });

    await run('--apply');

    expect(writes()).toEqual([
      {
        args: ['api', '--method', 'POST', `repos/${REPO}/rulesets`, '--input', '-'],
        body: DESIRED,
      },
    ]);
    expect(output()).toContain('applied: created ruleset main');
    expect(exit).not.toHaveBeenCalled();
  });

  it('writes nothing under --apply when nothing has drifted', async () => {
    stubGitHub();

    await run('--apply');

    expect(writes()).toEqual([]);
    expect(output()).toContain('Nothing to do.');
  });

  it('surfaces both streams of a failed gh call, the JSON body on stdout first', async () => {
    execFileSync.mockImplementation(() => {
      throw Object.assign(new Error('Command failed'), {
        stdout: Buffer.from('{"message":"Invalid property /rules/2"}\n'),
        stderr: Buffer.from('gh: Validation Failed (HTTP 422)\n'),
      });
    });

    const result = run();

    await expect(result).rejects.toThrow(
      'gh repo view --json nameWithOwner -q .nameWithOwner failed:\n' +
        '{"message":"Invalid property /rules/2"}\n' +
        'gh: Validation Failed (HTTP 422)',
    );
  });

  it("falls back to the error's own message when gh printed nothing", async () => {
    execFileSync.mockImplementation(() => {
      throw new Error('spawn gh ENOENT');
    });

    const result = run();

    await expect(result).rejects.toThrow(/failed:\nspawn gh ENOENT$/);
  });
});
