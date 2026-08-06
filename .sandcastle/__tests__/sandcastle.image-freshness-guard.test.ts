import * as fs from "node:fs";
import * as path from "node:path";
import {
  readPinnedPnpmVersion,
  ensureImageFreshness,
} from "../sandcastle-image-freshness.mts";

const ROOT = path.resolve(__dirname, "../..");
const SANDCASTLE = path.join(ROOT, ".sandcastle");

function read(file: string) {
  return fs.readFileSync(path.join(SANDCASTLE, file), "utf8");
}

// Issue #1900: PR #1877 bumped pnpm 11.15.1 -> 11.17.0 in package.json and the
// Dockerfile, but the `sandcastle:<checkout-dirname>` image was never rebuilt,
// so the whole 2026-07-25 batch ran the stale global pnpm 11.15.1 and every
// container hard-failed its own pre-push version check. The guard verifies the
// running image's toolchain matches the repo pin BEFORE any agent starts and
// rebuilds (or refuses to start) on drift.
describe("sandcastle image-freshness guard (issue #1900)", () => {
  describe("readPinnedPnpmVersion — package.json is the single source of truth", () => {
    it("extracts the semver from a pnpm@X.Y.Z+sha512… packageManager pin", () => {
      const pkg = path.join(ROOT, "package.json");
      const pinned = readPinnedPnpmVersion(pkg);
      // Must match what the Dockerfile installs and the pre-push hook enforces.
      expect(pinned).toMatch(/^\d+\.\d+\.\d+$/);
      const spec = JSON.parse(fs.readFileSync(pkg, "utf8"))
        .packageManager as string;
      expect(spec.startsWith(`pnpm@${pinned}`)).toBe(true);
    });

    it("throws loudly when the packageManager pin is missing or malformed", () => {
      const tmp = path.join(SANDCASTLE, "__tmp-bad-pkg.json");
      fs.writeFileSync(tmp, JSON.stringify({ name: "x" }), "utf8");
      try {
        expect(() => readPinnedPnpmVersion(tmp)).toThrow(/pnpm/i);
      } finally {
        fs.rmSync(tmp, { force: true });
      }
    });
  });

  describe("ensureImageFreshness — verify, rebuild on drift, fail loudly", () => {
    const base = {
      packageJsonPath: path.join(ROOT, "package.json"),
      dockerfilePath: path.join(SANDCASTLE, "Dockerfile"),
      imageName: "sandcastle:test",
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

    it("rebuilds when the image is missing (probe returns null)", () => {
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
        probe: () => (calls++ === 0 ? "11.15.1" : pinned),
        rebuild: () => {
          rebuilt = true;
        },
      });
      expect(rebuilt).toBe(true);
    });

    it("throws (refuses to start) when the image STILL mismatches after a rebuild", () => {
      // Mirrors the verification case: Dockerfile pins an old pnpm that
      // disagrees with package.json — rebuilding can never reconcile it.
      expect(() =>
        ensureImageFreshness({
          ...base,
          probe: () => "11.15.1", // never reaches the pin, even post-rebuild
          rebuild: () => {},
        }),
      ).toThrow();
    });
  });

  describe("wiring — the guard runs at startup before any agent", () => {
    const main = read("main.mts");

    it("main.mts imports and calls the freshness guard", () => {
      expect(main).toMatch(/ensureImageFreshness/);
      expect(main).toMatch(/sandcastle-image-freshness/);
    });

    it("the guard is invoked before the plan→execute→merge loop", () => {
      const guardIdx = main.indexOf("ensureImageFreshness(");
      const loopIdx = main.search(/for\s*\(\s*let\s+iteration/);
      expect(guardIdx).toBeGreaterThan(-1);
      expect(loopIdx).toBeGreaterThan(-1);
      expect(guardIdx).toBeLessThan(loopIdx);
    });
  });

  describe("rebuild avoids the whole-monorepo build-context stall", () => {
    const mod = read("sandcastle-image-freshness.mts");

    it("feeds the Dockerfile via stdin (docker build … -) not a context dir", () => {
      // `docker build -f .sandcastle/Dockerfile .` uploads the entire monorepo
      // (no .dockerignore) and stalls forever; the Dockerfile has zero COPY
      // lines so it needs no context. The stdin form `docker build -t … -` is
      // exact. Guard that the build passes "-" as the context.
      expect(mod).toMatch(/"build"[\s\S]*?"-"/);
      // And must NOT pass "." as the build context (the stall trap).
      expect(mod).not.toMatch(/"build"[\s\S]*?"\."\s*\]/);
    });
  });
});
