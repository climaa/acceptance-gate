import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const SANDCASTLE = path.join(ROOT, '.sandcastle');

function read(file: string) {
  return fs.readFileSync(path.join(SANDCASTLE, file), 'utf8');
}

/**
 * Strip comments so "must not appear" assertions test the actual code.
 * sandcastle-config.mts documents at length why it does NOT read
 * `process.env.TURBO_TOKEN` and why `dotenv.config()` is the wrong API —
 * naming both in prose. Without this, the explanation would fail the very
 * assertions it explains.
 */
function stripComments(source: string) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe('sandcastle-config.mts — gh preflight', () => {
  const content = read('sandcastle-config.mts');

  // Replaced a blind PATH prepend. Host-side `gh` call sites swallow their own
  // failures (fetchIssue -> null, branchHasOpenPr -> false), so a missing
  // binary silently drops the sc:* model overrides instead of erroring.
  it('checks gh is resolvable at import time', () => {
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

    it('createSandbox env includes TURBO_TOKEN', () => {
      expect(createSandboxCall).toMatch(/TURBO_TOKEN/);
    });

    it('createSandbox env includes TURBO_TEAM', () => {
      expect(createSandboxCall).toMatch(/TURBO_TEAM/);
    });

    it('createSandbox env does NOT include dead TURBO_CACHE_DIR (Turbo v2 ignores it)', () => {
      expect(createSandboxCall).not.toMatch(/TURBO_CACHE_DIR/);
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
    // scripts must inject it. Without -o, an exported TURBO_TEAM from a shell
    // profile still wins and the leak returns silently.
    const turboScripts = ['dev', 'build', 'lint', 'typecheck', 'test'] as const;

    it.each(turboScripts)('%s wraps turbo in dotenv with -o', (name) => {
      expect(pkg.scripts[name]).toMatch(/dotenv -e \.env -o -- turbo run/);
    });

    // This one reads .env itself via dotenv.parse — wrapping it would put the
    // values back into process.env, which is what we are avoiding.
    it('sandcastle is NOT wrapped — it reads .env directly', () => {
      expect(pkg.scripts.sandcastle).not.toMatch(/dotenv/);
    });

    it('depends on dotenv and dotenv-cli', () => {
      expect(pkg.devDependencies).toHaveProperty('dotenv');
      expect(pkg.devDependencies).toHaveProperty('dotenv-cli');
    });
  });
});
