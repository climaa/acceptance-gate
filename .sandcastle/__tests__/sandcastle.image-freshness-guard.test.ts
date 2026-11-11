import * as fs from 'node:fs';
import * as path from 'node:path';
import { ROOT, SANDCASTLE, read } from './helpers';
import {
  readPinnedPnpmVersion,
  readMaxAgeDays,
  parseClaudeVersion,
  ensureImageFreshness,
} from '../sandcastle-image-freshness.mts';

// A production incident: a bump moved pnpm 11.15.1 -> 11.17.0 in package.json and the
// Dockerfile, but the `sandcastle:<checkout-dirname>` image was never rebuilt,
// so the whole 2026-07-25 batch ran the stale global pnpm 11.15.1 and every
// container hard-failed its own pnpm version check. The guard verifies the
// running image's toolchain matches the repo pin BEFORE any agent starts and
// rebuilds (or refuses to start) on drift.
describe('sandcastle image-freshness guard', () => {
  describe('readPinnedPnpmVersion — package.json is the single source of truth', () => {
    it('extracts the semver from a pnpm@X.Y.Z+sha512… packageManager pin', () => {
      const pkg = path.join(ROOT, 'package.json');
      const pinned = readPinnedPnpmVersion(pkg);
      // Must match what the Dockerfile installs.
      expect(pinned).toMatch(/^\d+\.\d+\.\d+$/);
      const spec = JSON.parse(fs.readFileSync(pkg, 'utf8')).packageManager as string;
      expect(spec.startsWith(`pnpm@${pinned}`)).toBe(true);
    });

    it('throws loudly when the packageManager pin is missing or malformed', () => {
      const tmp = path.join(SANDCASTLE, '__tmp-bad-pkg.json');
      fs.writeFileSync(tmp, JSON.stringify({ name: 'x' }), 'utf8');
      try {
        expect(() => readPinnedPnpmVersion(tmp)).toThrow(/pnpm/i);
      } finally {
        fs.rmSync(tmp, { force: true });
      }
    });
  });

  describe('ensureImageFreshness — verify, rebuild on drift, fail loudly', () => {
    const base = {
      packageJsonPath: path.join(ROOT, 'package.json'),
      dockerfilePath: path.join(SANDCASTLE, 'Dockerfile'),
      imageName: 'sandcastle:test',
      // A fresh image with a working CLI, so these cases isolate the pnpm check.
      probeClaude: () => '2.1.280',
      probeCreated: () => new Date('2026-11-10T00:00:00Z'),
      now: new Date('2026-11-11T00:00:00Z'),
      maxAgeDays: 14,
      logger: { log: () => {}, warn: () => {} },
    };

    it("does NOT rebuild when the image's pnpm already matches the pin", () => {
      const pinned = readPinnedPnpmVersion(base.packageJsonPath);
      let rebuilt = false;
      ensureImageFreshness({
        ...base,
        probe: () => pinned,
        rebuild: () => {
          rebuilt = true;
        },
      });
      expect(rebuilt).toBe(false);
    });

    it('rebuilds when the image is missing (probe returns null)', () => {
      const pinned = readPinnedPnpmVersion(base.packageJsonPath);
      let rebuilt = false;
      let calls = 0;
      ensureImageFreshness({
        ...base,
        probe: () => (calls++ === 0 ? null : pinned),
        rebuild: () => {
          rebuilt = true;
        },
      });
      expect(rebuilt).toBe(true);
    });

    it("rebuilds when the image's pnpm drifts from the pin", () => {
      const pinned = readPinnedPnpmVersion(base.packageJsonPath);
      let rebuilt = false;
      let calls = 0;
      ensureImageFreshness({
        ...base,
        // First probe: stale version. After rebuild: the pinned version.
        probe: () => (calls++ === 0 ? '11.15.1' : pinned),
        rebuild: () => {
          rebuilt = true;
        },
      });
      expect(rebuilt).toBe(true);
    });

    it('throws (refuses to start) when the image STILL mismatches after a rebuild', () => {
      // Mirrors the verification case: Dockerfile pins an old pnpm that
      // disagrees with package.json — rebuilding can never reconcile it.
      expect(() =>
        ensureImageFreshness({
          ...base,
          probe: () => '11.15.1', // never reaches the pin, even post-rebuild
          rebuild: () => {},
        }),
      ).toThrow();
    });
  });

  // On 2026-10-14 the API began refusing the image's Claude Code CLI 2.1.233
  // ("version 2.1.280 or newer is required"): the CLI is installed unpinned and
  // was never checked, so a matching pnpm let a months-old image through and
  // every planner iteration failed with a 400 before any work.
  describe('ensureImageFreshness — the Claude Code CLI and the image age', () => {
    const base = {
      packageJsonPath: path.join(ROOT, 'package.json'),
      dockerfilePath: path.join(SANDCASTLE, 'Dockerfile'),
      imageName: 'sandcastle:test',
      now: new Date('2026-11-11T00:00:00Z'),
      maxAgeDays: 14,
    };
    const pinned = () => readPinnedPnpmVersion(base.packageJsonPath);

    function recorder() {
      const lines: string[] = [];
      const rebuilds: { noCache: boolean }[] = [];
      return {
        lines,
        rebuilds,
        logger: { log: (l: string) => lines.push(l), warn: (l: string) => lines.push(l) },
        rebuild: (_image: string, _dockerfile: string, opts: { noCache: boolean }) => {
          rebuilds.push(opts);
        },
      };
    }

    it('a fresh image with a matching pnpm does not rebuild and logs the CLI version', () => {
      // Arrange
      const rec = recorder();

      // Act
      ensureImageFreshness({
        ...base,
        probe: pinned,
        probeClaude: () => '2.1.280',
        probeCreated: () => new Date('2026-11-01T00:00:00Z'),
        rebuild: rec.rebuild,
        logger: rec.logger,
      });

      // Assert
      expect(rec.rebuilds).toEqual([]);
      expect(rec.lines.join('\n')).toMatch(/Claude Code 2\.1\.280/);
    });

    it('an image older than the limit is rebuilt with no cache', () => {
      // Arrange
      const rec = recorder();
      let created = new Date('2026-10-01T00:00:00Z');

      // Act
      ensureImageFreshness({
        ...base,
        probe: pinned,
        probeClaude: () => '2.1.300',
        probeCreated: () => created,
        rebuild: (image, dockerfile, opts) => {
          rec.rebuild(image, dockerfile, opts);
          created = base.now;
        },
        logger: rec.logger,
      });

      // Assert
      expect(rec.rebuilds).toEqual([{ noCache: true }]);
      expect(rec.lines.join('\n')).toMatch(/41 days old/);
      expect(rec.lines.join('\n')).toMatch(/Claude Code 2\.1\.300/);
    });

    it('an image within the limit is not rebuilt for its age', () => {
      // Arrange
      const rec = recorder();

      // Act
      ensureImageFreshness({
        ...base,
        maxAgeDays: 30,
        probe: pinned,
        probeClaude: () => '2.1.280',
        probeCreated: () => new Date('2026-10-14T00:00:00Z'),
        rebuild: rec.rebuild,
        logger: rec.logger,
      });

      // Assert
      expect(rec.rebuilds).toEqual([]);
    });

    it('a CLI probe that fails is rebuilt with no cache', () => {
      // Arrange
      const rec = recorder();
      let claude: string | null = null;

      // Act
      ensureImageFreshness({
        ...base,
        probe: pinned,
        probeClaude: () => claude,
        probeCreated: () => new Date('2026-11-10T00:00:00Z'),
        rebuild: (image, dockerfile, opts) => {
          rec.rebuild(image, dockerfile, opts);
          claude = '2.1.300';
        },
        logger: rec.logger,
      });

      // Assert
      expect(rec.rebuilds).toEqual([{ noCache: true }]);
      expect(rec.lines.join('\n')).toMatch(/Claude Code 2\.1\.300/);
    });

    it('a CLI probe that fails again after the rebuild throws', () => {
      // Arrange
      const rec = recorder();

      // Act
      const start = () =>
        ensureImageFreshness({
          ...base,
          probe: pinned,
          probeClaude: () => null,
          probeCreated: () => new Date('2026-11-10T00:00:00Z'),
          rebuild: rec.rebuild,
          logger: rec.logger,
        });

      // Assert
      expect(start).toThrow(/claude/i);
      expect(rec.rebuilds).toEqual([{ noCache: true }]);
    });

    it('a pnpm drift alone rebuilds with the cache, as before', () => {
      // Arrange
      const rec = recorder();
      let pnpm = '11.15.1';

      // Act
      ensureImageFreshness({
        ...base,
        probe: () => pnpm,
        probeClaude: () => '2.1.280',
        probeCreated: () => new Date('2026-11-10T00:00:00Z'),
        rebuild: (image, dockerfile, opts) => {
          rec.rebuild(image, dockerfile, opts);
          pnpm = pinned();
        },
        logger: rec.logger,
      });

      // Assert
      expect(rec.rebuilds).toEqual([{ noCache: false }]);
    });
  });

  describe('parseClaudeVersion — the CLI prints more than its version', () => {
    it('takes X.Y.Z out of `claude --version`', () => {
      expect(parseClaudeVersion('2.1.233 (Claude Code)\n')).toBe('2.1.233');
    });

    it('answers null for output that carries no version', () => {
      expect(parseClaudeVersion('command not found')).toBeNull();
    });
  });

  describe('readMaxAgeDays — SANDCASTLE_IMAGE_MAX_AGE_DAYS', () => {
    it('defaults to 14 days', () => {
      expect(readMaxAgeDays({})).toBe(14);
    });

    it('reads a positive number of days', () => {
      expect(readMaxAgeDays({ SANDCASTLE_IMAGE_MAX_AGE_DAYS: '3' })).toBe(3);
    });

    it('throws on a value that is not a positive number', () => {
      expect(() =>
        readMaxAgeDays({ SANDCASTLE_IMAGE_MAX_AGE_DAYS: 'two weeks' }),
      ).toThrow(/SANDCASTLE_IMAGE_MAX_AGE_DAYS/);
    });
  });

  describe('wiring — the guard runs at startup before any agent', () => {
    const main = read('main.mts');

    it('main.mts imports and calls the freshness guard', () => {
      expect(main).toMatch(/ensureImageFreshness/);
      expect(main).toMatch(/sandcastle-image-freshness/);
    });

    it('the guard is invoked before the plan→execute→merge loop', () => {
      const guardIdx = main.indexOf('ensureImageFreshness(');
      const loopIdx = main.search(/for\s*\(\s*let\s+iteration/);
      expect(guardIdx).toBeGreaterThan(-1);
      expect(loopIdx).toBeGreaterThan(-1);
      expect(guardIdx).toBeLessThan(loopIdx);
    });
  });

  describe('rebuild avoids the whole-monorepo build-context stall', () => {
    const mod = read('sandcastle-image-freshness.mts');

    it('feeds the Dockerfile via stdin (docker build … -) not a context dir', () => {
      // `docker build -f .sandcastle/Dockerfile .` uploads the entire monorepo
      // (no .dockerignore) and stalls forever; the Dockerfile has zero COPY
      // lines so it needs no context. The stdin form `docker build -t … -` is
      // exact. Guard that the build passes "-" as the context.
      expect(mod).toMatch(/["']build["'][\s\S]*?["']-["']/);
      // And must NOT pass "." as the build context (the stall trap).
      expect(mod).not.toMatch(/["']build["'][\s\S]*?["']\.["']\s*\]/);
    });

    it('can pass --no-cache, so a cached install.sh layer does not reinstall the old CLI', () => {
      expect(mod).toMatch(/['"]--no-cache['"]/);
    });
  });
});
