// Capture the corpus into one snapshot set.
//
//   node scripts/capture-set.mjs --root <dir> --data-dir <dir> --label <label> \
//     [--filter <substring>] [--sha <sha>] [--branch <name>] [--dirty true|false]
//
// The console's `capture` and `run` modes, as a process. It exists as a script
// rather than as another function in lib/runner.ts because the work has to
// happen INSIDE the pinned container — `check` refuses a host the committed
// baselines were not captured on — and what crosses that boundary is argv, not
// a closure. lib/runner.ts spawns this: through `docker run` from a developer's
// machine, directly when the console is already on the pinned image.
//
// Plain `.mjs` for the same reason: the container runs `node` against the
// host's mounted `node_modules`, with no TypeScript toolchain and no Next.
//
// It writes two things, and both are shapes apps/visual-diff-ui reads back
// through zod:
//
//   <dataDir>/sets/<label>/<variantKey>.png   the shots
//   <dataDir>/sets.json                       the row that makes them a set
//
// THE ARGV SEAM, AND HOW IT IS HELD. `check` runs against real `defaultDeps()`
// — a Storybook build, a browser, the pinned image — so a module that ran it on
// import could not be imported at all, and for as long as that was true nothing
// executed this file under test. `runner.test.ts` mocks `spawn`, which stops at
// the argv this script is handed, so both sides of the seam were asserted and
// neither was ever run against the other. Not academic: `--dirty` disagreed with
// its own parser here for as long as neither side was written down, and every
// real capture recorded a clean tree.
//
// The run is behind `main()` now, called only when node was pointed at this file.
// Importing it does nothing, so `__tests__/capture-set.test.ts` can take the argv
// lib/runner.ts actually emits — through the same spawn mock that pins it — and
// feed it to the real `parseArgs` below. One test, both implementations, no
// string copied between them.
//
// WHAT IS STILL OUT OF REACH. `writeSet` duplicates lib/jobs.ts's `recordSet`,
// and this file's own note used to say the blocker was that module's `next/cache`
// import. That import is gone. The blocker is the one two paragraphs up: the
// container runs bare `node` against mounted `node_modules`, with no TypeScript
// toolchain, and `recordSet` is TypeScript. Sharing it means shipping a build
// step into the container, which is a bigger change than the duplication costs —
// so the ROW is asserted instead, against the same zod schema the app reads the
// registry back through.
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { check, defaultDeps } from '@gate/visual-diff/commands';

/** Every line this prints is a line the run panel shows: the job log is stdout,
 *  and lib/runner.ts forwards it verbatim. */
const say = (message) => {
  process.stdout.write(`${message}\n`);
};

export function parseArgs(argv) {
  const args = {};

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (!flag.startsWith('--')) continue;

    const name = flag.slice(2);
    // A flag with nothing after it — or with another flag after it — is a
    // switch; everything else takes the value that follows. `--dirty` arrives
    // in the second form (`--dirty true`), so it lands here as a STRING.
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      args[name] = true;
      continue;
    }

    // Repeated flags collect. `--filter` is the one that repeats — one per
    // component the reviewer ticked — and the last-one-wins alternative would
    // silently capture a single component out of a set of five.
    args[name] = name in args ? [...[args[name]].flat(), next] : next;
    i += 1;
  }

  return args;
}

/**
 * Whether the capture came from a working tree with uncommitted changes.
 *
 * Two spellings, because there are two callers. lib/runner.ts sends the answer
 * git gave — `--dirty true` or `--dirty false` — so that a set records that the
 * tree WAS checked and found clean, rather than leaving a reader to wonder
 * whether anyone looked. A hand-run `--dirty` with nothing after it is the
 * switch this script's usage line used to describe, and `parseArgs` reads that
 * as the boolean `true`.
 *
 * Spelled out rather than left as `=== true`: that comparison against the
 * string lib/runner.ts actually sends is `false`, which is how every real
 * capture came to record `dirty: false` while the dirty badge only ever fired
 * for seeded fixtures.
 */
export const isDirty = (value) => value === true || value === 'true';

/**
 * The row a capture adds to `sets.json`.
 *
 * Pure, and separated from the write so it can be asserted: this is the shape
 * `SetsFileSchema` reads back, and the one place `--dirty` turns from the string
 * argv carries into the boolean the registry stores.
 *
 * `dirty` is absent rather than false when nothing was passed. A capture run by
 * hand did not check the tree, and a set that says `dirty: false` claims someone
 * looked.
 */
export function buildSet(args, { label, stories, capturedAt }) {
  return {
    label,
    // Passed in rather than read here: git is the host's answer, and this
    // process may be inside a container that has no `.git` and no `git`.
    sha: args.sha || 'unknown',
    branch: args.branch || 'unknown',
    capturedAt,
    stories,
    ...(args.dirty === undefined ? {} : { dirty: isDirty(args.dirty) }),
  };
}

/** The filters `check` runs with — one `--filter` per ticked component, collected
 *  back into the list `matchesFilter` reads as a union. Absent, not empty: the
 *  differ reads no filter as the whole corpus. */
export const filtersOf = (args) => (args.filter ? [args.filter].flat() : undefined);

/**
 * Everything this script does when node is pointed at it, and nothing it does
 * when it is imported.
 *
 * The guard below is the whole reason the seam is testable: `check` reaches for a
 * browser and the pinned image, so a module that called it at import could not be
 * loaded by a test at all. See the header.
 */
async function main(argv) {
  const args = parseArgs(argv);
  const rootDir = args.root && resolve(args.root);
  const dataDir = args['data-dir'] && resolve(args['data-dir']);
  const label = args.label;

  if (!rootDir || !dataDir || !label) {
    say('capture-set: needs --root, --data-dir and --label');
    process.exit(2);
  }

  const setDir = join(dataDir, 'sets', label);
  const registryPath = join(dataDir, 'sets.json');

  /** The registry as it stands, or an empty one. A file that is there and cannot
   *  be parsed stops the run: appending to it would rewrite it whole, and a
   *  half-written registry is how a console loses every set it has. */
  const readRegistry = () =>
    existsSync(registryPath)
      ? JSON.parse(readFileSync(registryPath, 'utf8'))
      : { sets: [] };

  /**
   * The shots, and the row that makes them a set.
   *
   * An `errored` variant is written like any other as long as it has bytes: the
   * capture still shot the page on its way out, `check`'s own report uses those
   * bytes as the candidate image, and a set that dropped them would make the next
   * compare call the story `removed` with nothing to explain it.
   */
  const writeSet = (captures) => {
    mkdirSync(setDir, { recursive: true });

    let written = 0;
    for (const shot of captures) {
      if (!shot.bytes) continue;

      writeFileSync(join(setDir, `${shot.key}.png`), shot.bytes);
      written += 1;
    }

    const registry = readRegistry();
    const set = buildSet(args, {
      label,
      stories: written,
      capturedAt: new Date().toISOString().slice(0, 10),
    });

    writeFileSync(
      registryPath,
      `${JSON.stringify(
        {
          ...registry,
          sets: [set, ...registry.sets.filter((entry) => entry.label !== label)],
        },
        null,
        2,
      )}\n`,
    );

    return written;
  };

  const deps = defaultDeps();
  const filter = filtersOf(args);

  const result = await check(
    {
      ...deps,
      // The seam. `check` keeps candidate bytes in memory and writes only its own
      // artifacts, so this is the one moment the shots exist as bytes anybody else
      // can have. Written here, before `check`'s sanity gates: the shots were
      // taken, and whether the run passes is the exit code's verdict rather than a
      // reason to throw the pixels away.
      capture: async (run) => {
        say(`capturing ${run.variants.length} variant(s)`);
        const captured = await deps.capture(run);
        const written = writeSet(captured.captures);
        const errored = captured.captures.filter(
          (shot) => shot.bucket === 'errored',
        ).length;

        say(
          `wrote sets/${label} — ${written} shot(s)${errored ? `, ${errored} errored` : ''}`,
        );

        return captured;
      },
    },
    { rootDir, ...(filter ? { filter } : {}) },
  );

  say(result.message);
  process.exit(result.exitCode);
}

/**
 * Whether node was pointed at THIS file, rather than at something that imported
 * it. The whole of what makes the seam testable — see the header.
 *
 * Both sides are resolved through `realpathSync`, and that is not defensive
 * padding. `import.meta.url` is already the real path, because node resolves
 * module specifiers through symlinks; `process.argv[1]` is the string the caller
 * typed. Compare them raw and a checkout reached through a symlink fails the test
 * — `/tmp/x` against `/private/tmp/x` on macOS, which is every `/tmp` path on this
 * platform — and the script then exits 0 having captured nothing. A capture that
 * silently does nothing is a worse failure than the one this guard exists to
 * enable, so the comparison is on what the two paths point AT.
 */
function invokedDirectly() {
  const invoked = process.argv[1];
  if (!invoked) return false;

  try {
    return realpathSync(invoked) === fileURLToPath(import.meta.url);
  } catch {
    // A path that cannot be resolved is not this file.
    return false;
  }
}

if (invokedDirectly()) {
  await main(process.argv.slice(2));
}
