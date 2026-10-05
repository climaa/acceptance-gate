import * as fs from 'node:fs';
import * as path from 'node:path';
import { ROOT, SANDCASTLE, read, stripComments } from './helpers';

describe('sandcastle-config.mts — gh preflight', () => {
  const content = read('sandcastle-config.mts');

  // Replaced a blind PATH prepend. Host-side `gh` call sites swallow their own
  // failures (fetchIssue -> null, branchHasOpenPr -> false), so a missing
  // binary silently drops the sc:* model overrides instead of erroring.
  it('checks gh is resolvable', () => {
    expect(stripComments(content)).toMatch(/command -v gh/);
  });

  it('throws rather than continuing when gh is absent', () => {
    expect(stripComments(content)).toMatch(/throw new Error/);
  });

  it('no longer mutates process.env.PATH', () => {
    expect(stripComments(content)).not.toMatch(/process\.env\.PATH\s*=/);
  });

  it('hardcodes no install locations', () => {
    expect(stripComments(content)).not.toMatch(/\/opt\/homebrew|\/usr\/local\/bin/);
  });

  // The preflight and the turbo-cache log used to run as a side effect of
  // importing sandcastle-config.mts, which meant no unit test could load the
  // test and is why two modules deliberately import nothing at all. They are
  // explicit functions now — but an explicit call can be forgotten where an
  // import could not, so that new failure mode is what these cover.
  it('exposes the preflight as a callable rather than running it on import', () => {
    const code = stripComments(content);
    expect(code).toMatch(/export function assertGhAvailable\(\)/);
    // The execSync probe must sit INSIDE the function, not at module scope.
    const moduleScope = code.replace(/export function [\s\S]*?\n}\n/g, '');
    expect(moduleScope).not.toMatch(/command -v gh/);
  });

  it('leaves no console output at module scope', () => {
    const moduleScope = stripComments(content).replace(
      /export function [\s\S]*?\n}\n/g,
      '',
    );
    expect(moduleScope).not.toMatch(/console\./);
  });

  it('main.mts calls both, since importing no longer does it', () => {
    const main = stripComments(read('main.mts'));
    expect(main).toMatch(/assertGhAvailable\(\)/);
    expect(main).toMatch(/logTurboCacheStatus\(\)/);
  });

  it('main.mts runs the gh preflight before any sandbox work starts', () => {
    const main = stripComments(read('main.mts'));
    const preflight = main.indexOf('assertGhAvailable()');
    // Cheapest proxy for "before any container": the image-freshness guard is
    // the first thing that shells out to docker.
    const firstDockerWork = main.indexOf('ensureImageFreshness()');
    expect(preflight).toBeGreaterThan(-1);
    expect(firstDockerWork).toBeGreaterThan(-1);
    expect(preflight).toBeLessThan(firstDockerWork);
  });
});

describe('sandcastle turbo-env passthrough', () => {
  // A single call site creates a worktree sandbox: sandcastle-worktree-sandbox.mts,
  // shared by the per-issue pipeline and the stranded-branch rescue path. The two
  // blocks below assert once against that helper instead of once per call site.
  // Sliced eagerly, and hard-failing when the call is not found: on a miss,
  // indexOf() returns -1 and slice(-1) would silently satisfy every `not.toMatch`.
  const createSandboxCall = (() => {
    const content = read('sandcastle-worktree-sandbox.mts');
    const idx = content.indexOf('sandcastle.createSandbox({');
    if (idx === -1) {
      throw new Error(
        'sandcastle-worktree-sandbox.mts: no `sandcastle.createSandbox({` call to assert against',
      );
    }
    return content.slice(idx, idx + 600);
  })();

  /**
   * Credential resolution itself is covered behaviourally in
   * sandcastle.turbo-cache.test.ts, which imports the pure resolver and calls
   * it with real inputs. What remains here is only what a unit test cannot
   * see: wiring between modules, and a provenance rule about tracked source.
   */
  describe('sandcastle-config.mts — wiring', () => {
    const content = read('sandcastle-config.mts');
    const worktreeSandboxContent = read('sandcastle-worktree-sandbox.mts');

    it('delegates the decision to the pure resolver instead of inlining it', () => {
      expect(stripComments(content)).toMatch(/resolveTurboCache\(/);
      expect(stripComments(content)).toMatch(/sandcastle-turbo-cache\.mts/);
    });

    it('exports turboToken/turboTeam for consumers to import', () => {
      expect(content).toMatch(/export const turboToken/);
      expect(content).toMatch(/export const turboTeam/);
    });

    it('sandcastle-worktree-sandbox.mts (the createSandbox call site) imports turboToken/turboTeam from sandcastle-config.mts', () => {
      expect(worktreeSandboxContent).toMatch(
        /import\s*\{[^}]*turboToken[^}]*\}\s*from\s*["']\.\/sandcastle-config\.mts["']/,
      );
    });
  });

  // Provenance, not behaviour: a Vercel team ID committed to this public repo
  // once required a full git-history rewrite to remove. Deriving the expected
  // team from the gitignored `.turbo/config.json` is what keeps it out; this
  // asserts no orchestrator source reintroduces a literal.
  describe('no account identifier in tracked orchestrator source', () => {
    const sources = fs
      .readdirSync(SANDCASTLE)
      .filter((f) => f.endsWith('.mts'))
      .map((f) => [f, read(f)] as const);

    it('finds .mts sources to scan', () => {
      expect(sources.length).toBeGreaterThan(0);
    });

    it.each(sources)('%s carries no Vercel team ID literal', (_name, source) => {
      expect(source).not.toMatch(/team_[A-Za-z0-9]{10,}/);
    });
  });

  describe('createSandbox env passthrough — the shared worktree-sandbox helper', () => {
    it('createSandbox call includes an env option', () => {
      expect(createSandboxCall).toMatch(/env\s*:/);
    });

    // The credentials and the local cache directory are built by
    // sandboxTurboEnv(), whose cases sandcastle.turbo-cache.test.ts holds as
    // unit tests. Here: the worktree sandbox passes exactly that, with the
    // resolved credentials.
    it('createSandbox env is sandboxTurboEnv(turboToken, turboTeam)', () => {
      expect(createSandboxCall).toMatch(
        /env\s*:\s*sandboxTurboEnv\(turboToken,\s*turboTeam\)/,
      );
    });

    // This used to assert the opposite ("Turbo v2 ignores it"), a premise from
    // the seed. turbo 2.11.5 documents TURBO_CACHE_DIR
    // (docs/reference/system-environment-variables.mdx), and from 3 to 5 Oct
    // 2026 every agent's first push failed until it was set.
    it('the sandbox env sets TURBO_CACHE_DIR, through sandboxTurboEnv', () => {
      expect(stripComments(read('sandcastle-turbo-cache.mts'))).toMatch(
        /TURBO_CACHE_DIR:/,
      );
    });
  });

  // Not turbo, but the same call: the library's 10s default for each git setup
  // command killed a reviewer's sandbox on 5 Oct 2026 while the host ran a push
  // gate, and that branch merged unreviewed.
  describe('createSandbox git setup timeout — the shared worktree-sandbox helper', () => {
    it('sets gitSetupMs from SANDBOX_GIT_SETUP_TIMEOUT_MS', () => {
      expect(createSandboxCall).toMatch(
        /timeouts\s*:\s*\{\s*gitSetupMs\s*:\s*SANDBOX_GIT_SETUP_TIMEOUT_MS\s*\}/,
      );
    });

    it('allows well over the library default of 10s', async () => {
      const { SANDBOX_GIT_SETUP_TIMEOUT_MS } =
        await import('../sandcastle-variables.mts');
      expect(SANDBOX_GIT_SETUP_TIMEOUT_MS).toBeGreaterThanOrEqual(60_000);
    });
  });

  describe('createSandbox docker uid mapping — the shared worktree-sandbox helper', () => {
    it('docker() in createSandbox passes containerUid so container writes bind-mounts as host uid', () => {
      expect(createSandboxCall).toMatch(/containerUid/);
    });

    it('docker() in createSandbox passes containerGid', () => {
      expect(createSandboxCall).toMatch(/containerGid/);
    });

    it('containerUid is derived from process.getuid', () => {
      expect(createSandboxCall).toMatch(/process\.getuid/);
    });

    it('containerGid is derived from process.getgid', () => {
      expect(createSandboxCall).toMatch(/process\.getgid/);
    });

    it('containerUid falls back to 1000 when process.getuid is unavailable (e.g. Windows)', () => {
      expect(createSandboxCall).toMatch(
        /getuid[^)]*\?\s*\.\s*\(\s*\)\s*\?\?.*1000|getuid\?\.\(\)\s*\?\?\s*1000/,
      );
    });
  });

  describe('.env.example — documentation block only, no KEY= lines', () => {
    const content = read('.env.example');

    it('mentions TURBO_TOKEN in a comment', () => {
      expect(content).toMatch(/#.*TURBO_TOKEN|TURBO_TOKEN.*#/i);
    });

    it('mentions TURBO_TEAM in a comment', () => {
      expect(content).toMatch(/#.*TURBO_TEAM|TURBO_TEAM.*#/i);
    });

    it('does not add TURBO_TOKEN= as a KEY= line', () => {
      expect(content).not.toMatch(/^TURBO_TOKEN\s*=/m);
    });

    it('does not add TURBO_TEAM= as a KEY= line', () => {
      expect(content).not.toMatch(/^TURBO_TEAM\s*=/m);
    });

    it('mentions turbo login or turbo link for setup', () => {
      expect(content).toMatch(/turbo login|turbo link/i);
    });

    it('points at the repo-root .env as the real location', () => {
      expect(content).toMatch(/root/i);
    });
  });

  describe('repo-root .env.example — the committed template', () => {
    const content = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8');

    it('declares TURBO_TOKEN as a KEY= line to fill in', () => {
      expect(content).toMatch(/^TURBO_TOKEN=/m);
    });

    it('declares TURBO_TEAM as a KEY= line to fill in', () => {
      expect(content).toMatch(/^TURBO_TEAM=/m);
    });

    it('ships no real values — placeholders only', () => {
      expect(content).not.toMatch(/^TURBO_TOKEN=.+/m);
      expect(content).not.toMatch(/^TURBO_TEAM=.+/m);
    });

    it('carries no Vercel team identifier literal', () => {
      expect(content).not.toMatch(/team_[A-Za-z0-9]{10,}/);
    });
  });

  describe('package.json — turbo scripts load .env with override', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

    // turbo is a binary we do not control and cannot read .env itself, so the
    // scripts must inject it. Without --override, an exported TURBO_TEAM from a shell
    // profile still wins and the leak returns silently.
    const turboScripts = ['dev', 'build', 'lint', 'typecheck', 'test'] as const;

    it.each(turboScripts)('%s wraps turbo in dotenv with --override', (name) => {
      expect(pkg.scripts[name]).toMatch(/dotenv run -q --override -- turbo run/);
    });

    // This one reads .env itself via dotenv.parse — wrapping it would put the
    // values back into process.env, which is what we are avoiding.
    it('sandcastle is NOT wrapped — it reads .env directly', () => {
      expect(pkg.scripts.sandcastle).not.toMatch(/dotenv/);
    });

    // dotenv ships its own `dotenv` command from v18. dotenv-cli installs one
    // under the same name with a different syntax, and whichever pnpm links
    // last wins — so the two cannot both be installed.
    it('depends on dotenv and not on dotenv-cli', () => {
      expect(pkg.devDependencies).toHaveProperty('dotenv');
      expect(pkg.devDependencies).not.toHaveProperty('dotenv-cli');
    });
  });
});
