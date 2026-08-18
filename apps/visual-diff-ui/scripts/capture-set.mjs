// Capture the corpus into one snapshot set.
//
//   node scripts/capture-set.mjs --root <dir> --data-dir <dir> --label <label> \
//     [--filter <substring>] [--sha <sha>] [--branch <name>] [--dirty]
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
// `__tests__/capture-set.test.ts` parses what this writes with those schemas —
// the same bargain apps/e2e/scripts/seed-visual-diff.mjs takes.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { check, defaultDeps } from '@gate/visual-diff/commands';

/** Every line this prints is a line the run panel shows: the job log is stdout,
 *  and lib/runner.ts forwards it verbatim. */
const say = (message) => {
  process.stdout.write(`${message}\n`);
};

function parseArgs(argv) {
  const args = {};

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (!flag.startsWith('--')) continue;

    const name = flag.slice(2);
    // `--dirty` is a switch; everything else takes the value after it.
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

const args = parseArgs(process.argv.slice(2));
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
function readRegistry() {
  if (!existsSync(registryPath)) return { sets: [] };

  return JSON.parse(readFileSync(registryPath, 'utf8'));
}

/**
 * The shots, and the row that makes them a set.
 *
 * An `errored` variant is written like any other as long as it has bytes: the
 * capture still shot the page on its way out, `check`'s own report uses those
 * bytes as the candidate image, and a set that dropped them would make the next
 * compare call the story `removed` with nothing to explain it.
 */
function writeSet(captures) {
  mkdirSync(setDir, { recursive: true });

  let written = 0;
  for (const shot of captures) {
    if (!shot.bytes) continue;

    writeFileSync(join(setDir, `${shot.key}.png`), shot.bytes);
    written += 1;
  }

  const registry = readRegistry();
  const set = {
    label,
    // Passed in rather than read here: git is the host's answer, and this
    // process may be inside a container that has no `.git` and no `git`.
    sha: args.sha || 'unknown',
    branch: args.branch || 'unknown',
    capturedAt: new Date().toISOString().slice(0, 10),
    stories: written,
    ...(args.dirty === undefined ? {} : { dirty: args.dirty === true }),
  };

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
}

const deps = defaultDeps();

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
  { rootDir, ...(args.filter ? { filter: [args.filter].flat() } : {}) },
);

say(result.message);
process.exit(result.exitCode);
