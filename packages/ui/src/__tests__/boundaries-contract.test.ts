/**
 * What `boundaries/dependencies` actually permits, run rather than described.
 *
 * The rule is assembled in `eslint.config.mjs` out of `TIERS`, `barrelOf`,
 * `reachableTypes` and `default: 'disallow'`, and the sentence a reader takes
 * away from that is three derivations removed from the rule itself.
 * `Skeleton.tsx` carried the inverted reading until #350 noticed it: it said an
 * atom may not import a sibling atom, which is the one edge within a tier the
 * config goes out of its way to allow, and named that non-rule as the reason
 * `.ds-skeleton-group` hand-writes the two declarations `Stack` would give it.
 *
 * Nothing caught it because nothing asserted the rule at all. `eslint .` proves
 * the corpus contains no violation, which is a weaker claim than it looks: a
 * config allowing everything passes it just as quietly as one allowing the right
 * things, and so does a config forbidding an edge the corpus happens not to draw
 * yet. Every case below is an edge no committed source draws in the direction
 * that would fail, so this file is the only place they are exercised.
 *
 * `lintText` against paths that do not exist, so the probes leave no fixtures on
 * disk and cannot be swept up by `coverage.include`, which reads `src/**` off the
 * filesystem and would score a temporary `.tsx` as an uncovered component. The
 * probe FILE is imaginary but its DIRECTORY must be real — the node resolver
 * takes the importing file's directory as its basedir and answers "not found"
 * for every specifier when that directory is missing, which makes the rule report
 * nothing and every assertion below pass vacuously. `beforeAll` asserts both probe
 * directories exist for that reason, and the refusals are written as counts rather
 * than as `not.toEqual([])`, so a silently disarmed rule fails here instead of
 * approving.
 *
 * Structural, never appearance: which imports the layering permits, never what
 * any component renders.
 */
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const RULE = 'boundaries/dependencies';

/** An imaginary file in a real component folder. See the note on basedir above. */
const ATOM = 'src/atoms/Skeleton/boundaries-probe.tsx';
const MOLECULE = 'src/molecules/Card/boundaries-probe.tsx';

/** The boundaries messages a one-import module at `filePath` produces. */
const boundaryErrors = async (filePath: string, specifier: string) => {
  const [result] = await eslint.lintText(
    `import { thing } from '${specifier}';\nexport const probe = thing;\n`,
    { filePath },
  );

  return (result?.messages ?? [])
    .filter((message) => message.ruleId === RULE)
    .map((message) => message.message);
};

/**
 * The FIRST `lintText` pays for the whole flat-config and plugin graph and takes
 * seconds under a loaded worker pool; every one after it is milliseconds. That
 * cost is charged to `beforeAll` and given its own budget, so the default 5 s
 * per-test timeout does not turn a warm-up into a failure the way it did on the
 * first run of this file inside the full suite.
 */
const SETUP_TIMEOUT_MS = 60_000;

let eslint: ESLint;

beforeAll(async () => {
  for (const probe of [ATOM, MOLECULE]) {
    expect(existsSync(join(PACKAGE_ROOT, dirname(probe)))).toBe(true);
  }

  // `cwd` is pinned because the element patterns in the config (`src/atoms/**/*`)
  // are relative to it. Vitest runs from the package root today; stating it means
  // a runner launched from elsewhere fails on the assertions rather than matching
  // no element and reporting a clean bill of health.
  eslint = new ESLint({ cwd: PACKAGE_ROOT });

  await boundaryErrors(ATOM, '../Stack/Stack');
}, SETUP_TIMEOUT_MS);

describe('the tier layering rule', () => {
  it('lets an atom import a sibling atom directly', async () => {
    // The claim #350 was opened against. `Thumbnail.tsx` is the committed proof
    // that this direction is used and not merely tolerated: it is an atom, and it
    // imports `../Skeleton/Skeleton`.
    expect(await boundaryErrors(ATOM, '../Stack/Stack')).toEqual([]);
  });

  it('refuses an atom reaching a sibling atom through the tier barrel', async () => {
    // The half of the Skeleton comment that was right, and the whole of the
    // constraint. `..` and `../index` are one edge; both are named because the
    // bare form is the one a writer reaches for.
    expect(await boundaryErrors(ATOM, '..')).toHaveLength(1);
    expect(await boundaryErrors(ATOM, '../index')).toHaveLength(1);
  });

  it('lets a molecule reach an atom directly or through the atom barrel', async () => {
    // Inward is allowed both ways: the barrel restriction is about SIBLINGS, not
    // about barrels. Stating it stops "never import from a barrel" becoming the
    // next over-reading.
    expect(await boundaryErrors(MOLECULE, '../../atoms/Stack/Stack')).toEqual([]);
    expect(await boundaryErrors(MOLECULE, '../../atoms')).toEqual([]);
  });

  it('refuses a component importing a later tier, directly or through its barrel', async () => {
    // The direction the layering exists to forbid. If these ever pass, the rule
    // has stopped being applied and the allowances above mean nothing.
    expect(await boundaryErrors(ATOM, '../../molecules/Card/Card')).toHaveLength(1);
    expect(await boundaryErrors(MOLECULE, '../../organisms/Table/Table')).toHaveLength(1);
    expect(await boundaryErrors(MOLECULE, '../../organisms')).toHaveLength(1);
  });
});
