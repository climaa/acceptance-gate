// The visual-diff worlds' data directories, built before their servers boot.
//
//   node scripts/seed-visual-diff.mjs <target-dir>              the seeded world
//   node scripts/seed-visual-diff.mjs <target-dir> --mutating   the world jobs wreck
//   node scripts/seed-visual-diff.mjs <target-dir> --empty      the sample world
//
// Seeding is the webServer's job, never a test's: a scenario that seeds is a
// scenario every other scenario has to run after. Each `webServer` entry in
// playwright.config.ts runs this before `next start`, so a re-run starts from
// the same tree the last one did — which is what lets the mutating world be
// wrecked and the read-only one be shared.
//
// The committed sample fixture (apps/visual-diff-ui/fixtures/) pins
// authenticity: it is a real regression, it fabricates nothing, and it
// legitimately shows `a11y: 0`. The seeded worlds need states that report
// cannot produce — a dirty set, a worktree hold, four outcome words, a removed
// variant, an accessibility failure — so this applies a FABRICATED overlay
// (seed/visual-diff/) on top of a COPY of the fixture. The fixture itself is
// never touched.
//
// Everything this writes is read back before the script exits: the shapes come
// from apps/visual-diff-ui (lib/summary.ts's schemas, lib/jobs.ts's history and
// worktree registry) and a seed the app cannot read has to fail here rather
// than three scenarios into a browser run. `__tests__/seed.test.ts` in that
// workspace closes the loop against the real zod schemas.
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  cpSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

import { SKIP_TAG, THRESHOLDS, parseVariantKey } from '@gate/visual-diff/policy';

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = resolve(workspace, '..', 'visual-diff-ui', 'fixtures');
const OVERLAY = join(workspace, 'seed', 'visual-diff');

/**
 * The five labels apps/e2e/steps/acceptance/visual-diff-console.steps.ts pins as
 * `SEEDED_SETS`, restated rather than imported: this is a `.mjs` script and
 * that is a TypeScript module compiled by Playwright's own loader. A drift
 * between the two lists is visible immediately — the console scenarios assert
 * every one of these rows by label.
 */
const PINNED_LABELS = [
  'main-2026-08-17',
  'main-2026-08-16',
  'main-2026-08-13',
  'main-2026-08-12',
  'main-2026-08-11',
];

/** The console renders a set's size with `formatBytes`, which only reaches "kB"
 *  above a thousand bytes — and the listing scenario asserts `kB` or `MB`. A
 *  shot tree under this is a world that would fail that assertion with "980 B",
 *  which reads as a broken app rather than as a thin seed. */
const MIN_SET_BYTES = 1_000;

/** Every shot is this many pixels square. Small enough that eighteen of them
 *  per set cost nothing, large enough that a drifted variant differs by more
 *  than `THRESHOLDS.maxDiffPixels` and lands in `changed` rather than being
 *  absorbed by the allowance. */
const SHOT_PX = 16;

function fail(message) {
  console.error(`✗ seed-visual-diff: ${message}`);
  process.exit(1);
}

function check(condition, message) {
  if (!condition) fail(message);
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

// ---- Deterministic PNGs ---------------------------------------------------

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }

  return value >>> 0;
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);

  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');

  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);

  return Buffer.concat([head, data, crc]);
}

/** SHA-256 over the seed, extended by block index — deterministic, and
 *  incompressible enough that a shot's size is its pixel count rather than
 *  whatever deflate makes of a flat colour. */
function noise(seed, length) {
  const out = Buffer.alloc(length);
  for (let filled = 0, block = 0; filled < length; block += 1) {
    const digest = createHash('sha256').update(`${seed}:${block}`).digest();
    digest.copy(out, filled, 0, Math.min(digest.length, length - filled));
    filled += digest.length;
  }

  return out;
}

/**
 * One shot: an 8-bit RGBA PNG of {@link SHOT_PX} squared, whose pixels are a
 * pure function of `seed`.
 *
 * Real PNG bytes, not a placeholder: `pngjs` decodes these in the differ's own
 * comparer and `pngSize` reads their IHDR, so a shot that is not a shot fails
 * the compare rather than the assertion about it.
 */
function shotPng(seed) {
  const stride = SHOT_PX * 4;
  const pixels = noise(seed, SHOT_PX * stride);
  // Opaque, so a comparer never has to reason about alpha it was not given.
  for (let index = 3; index < pixels.length; index += 4) pixels[index] = 0xff;

  const raw = Buffer.alloc(SHOT_PX * (1 + stride));
  for (let row = 0; row < SHOT_PX; row += 1) {
    // Filter byte 0 (None) per scanline — the whole PNG filter vocabulary this
    // needs, since nothing here is trying to compress well. `Buffer.alloc`
    // already zeroed it; the copy below is what must land after it.
    pixels.copy(raw, row * (1 + stride) + 1, row * stride, (row + 1) * stride);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(SHOT_PX, 0);
  header.writeUInt32BE(SHOT_PX, 4);
  header.set([8, 6, 0, 0, 0], 8);

  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/** What a shot is seeded from. A drifted variant mixes its set's label in, so
 *  the same key is different bytes in two sets and the compare reports it
 *  `changed`; everything else is byte-identical across sets and reports
 *  `unchanged`. */
function shotSeed(label, key, drifted) {
  return drifted.includes(key) ? `${label}::${key}` : key;
}

// ---- The overlay ----------------------------------------------------------

function readOverlay() {
  return {
    sets: readJson(join(OVERLAY, 'sets.json')).sets,
    history: readJson(join(OVERLAY, 'history.json')),
    worktrees: readJson(join(OVERLAY, 'worktrees.json')),
    shots: readJson(join(OVERLAY, 'shots.json')),
    graft: readJson(join(OVERLAY, 'report-graft.json')),
    accept: readJson(join(OVERLAY, 'report-accept.json')),
    baselineEnv: readJson(join(OVERLAY, 'baseline-env.json')),
  };
}

/** Worst first by the shared box, ties by key — `artifacts.mjs`'s own order, so
 *  a grafted variant sits where the differ would have written it. */
function worstFirst(left, right) {
  if (left.overlapDiffPixels !== right.overlapDiffPixels) {
    return right.overlapDiffPixels - left.overlapDiffPixels;
  }

  return left.key < right.key ? -1 : 1;
}

/**
 * Graft the fabricated variants into the copied report.
 *
 * `unchanged` is carried over rather than recomputed: the differ drops those
 * variants before `summary.variants` is written, so the only record of them is
 * the count the fixture already holds. Every other bucket is counted from the
 * array, which is what makes the counts true of the file rather than of the
 * fixture they started as.
 */
function graftReport(target, graft) {
  const file = join(target, 'reports', graft.report, 'summary.json');
  const summary = readJson(file);

  const variants = [...summary.variants, ...graft.variants].sort(worstFirst);
  const counts = { ...summary.counts };
  for (const bucket of Object.keys(counts)) {
    if (bucket === 'unchanged') continue;
    counts[bucket] = variants.filter((variant) => variant.bucket === bucket).length;
  }

  // `isSample` is provenance on the committed fixture. This tree is an
  // instance's own data directory, and a report claiming to be a sample inside
  // one would be the file disagreeing with the console reading it.
  delete summary.isSample;

  writeJson(file, {
    ...summary,
    counts,
    warnings: [...summary.warnings, ...graft.warnings],
    variants,
  });

  writeGraftedShots(join(target, 'reports', graft.report, 'shots'), graft.variants);
}

/** The three PNGs a reviewable variant is opened as. A `removed` variant has no
 *  candidate by definition — it is a baseline the run did not reproduce — so it
 *  gets neither a candidate nor a diff. */
function writeGraftedShots(dir, variants) {
  mkdirSync(dir, { recursive: true });

  for (const variant of variants) {
    const kinds =
      variant.bucket === 'removed' ? ['baseline'] : ['baseline', 'candidate', 'diff'];
    for (const kind of kinds) {
      writeFileSync(
        join(dir, `${variant.key}.${kind}.png`),
        shotPng(`${variant.key}.${kind}`),
      );
    }
  }
}

/** One flat directory of PNGs per set — the layout lib/jobs.ts documents and
 *  lib/runner.ts's `readSet` reads. */
function writeShotTrees(target, sets, shots) {
  for (const set of sets) {
    const dir = join(target, 'sets', set.label);
    mkdirSync(dir, { recursive: true });

    for (const key of shots.variants) {
      writeFileSync(
        join(dir, `${key}.png`),
        shotPng(shotSeed(set.label, key, shots.drifted)),
      );
    }
  }
}

/** What every report in one world shares: one schema, one set of thresholds,
 *  one host. Read off the report the fixture brought, which is the run that
 *  recorded them. */
function runProvenance(target, reportId) {
  const { schemaVersion, thresholds, env } = readJson(
    join(target, 'reports', reportId, 'summary.json'),
  );

  return { schemaVersion, thresholds, env };
}

/**
 * The world's second report: the clean comparison an accept can promote from.
 *
 * The grafted report above carries an accessibility failure, and `acceptGate`
 * asks that question first and refuses outright — so on a world holding only
 * that report, the accept tab can never show the review gate or the host one,
 * which is two of the four acceptance scenarios. This is the report those two
 * are about: the two newest sets, compared, with nothing but pixels between
 * them.
 *
 * Its sides ARE those sets' own shot trees, copied rather than synthesised, so
 * the accept promotes the very bytes `sets/<candidate>/` holds. Only the diff
 * is invented: nothing here paints one, and the console never opens it for an
 * assertion.
 *
 * `schemaVersion`, `thresholds` and `env` come from the fixture's own run: one
 * differ on one host wrote both reports in this tree, and two summaries
 * disagreeing about either would be a tree no run could have produced.
 */
function writeAcceptReport(target, accept, provenance) {
  const [baselineSet, candidateSet] = accept.report.split('__');
  const dir = join(target, 'reports', accept.report);
  const shots = join(dir, 'shots');
  mkdirSync(shots, { recursive: true });

  writeJson(join(dir, 'summary.json'), {
    ...provenance,
    exitCode: accept.exitCode,
    counts: accept.counts,
    warnings: [],
    variants: accept.variants,
  });

  for (const { key } of accept.variants) {
    const sideShot = (label) => join(target, 'sets', label, `${key}.png`);

    copyFileSync(sideShot(baselineSet), join(shots, `${key}.baseline.png`));
    copyFileSync(sideShot(candidateSet), join(shots, `${key}.candidate.png`));
    writeFileSync(join(shots, `${key}.diff.png`), shotPng(`${key}.diff`));
  }
}

/** What an accept promotes into (D3), and the stamp it restamps. Only the
 *  mutating world gets one: it is the only world allowed to write. */
function writeBaselines(target, shots, baselineEnv) {
  const dir = join(target, '__baselines__');
  mkdirSync(dir, { recursive: true });

  for (const key of shots.variants) writeFileSync(join(dir, `${key}.png`), shotPng(key));
  writeJson(join(dir, 'BASELINE_ENV.json'), baselineEnv);
}

// ---- Verification ---------------------------------------------------------

const HISTORY_KEYS = [
  'id',
  'mode',
  'label',
  'startedAt',
  'endedAt',
  'exitCode',
  'reportId',
];

function dirBytes(dir) {
  return readdirSync(dir).reduce(
    (total, name) => total + statSync(join(dir, name)).size,
    0,
  );
}

function verifySets(target, sets) {
  const labels = sets.map((set) => set.label);
  check(
    labels.join() === PINNED_LABELS.join(),
    `seed/visual-diff/sets.json lists ${labels.join(', ')}, the scenarios pin ${PINNED_LABELS.join(', ')}`,
  );

  for (const label of labels) {
    const bytes = dirBytes(join(target, 'sets', label));
    check(
      bytes >= MIN_SET_BYTES,
      `sets/${label} is ${bytes} bytes — under ${MIN_SET_BYTES}, the console would render it as "B" and the listing scenario asserts kB or MB`,
    );
  }
}

function verifyShots(shots) {
  for (const key of shots.variants) {
    check(
      parseVariantKey(key) !== null,
      `${key} is not a variant key the differ can place`,
    );
  }
  for (const key of shots.drifted) {
    check(
      shots.variants.includes(key),
      `drifted key ${key} is not one of the seeded variants`,
    );
  }

  const drifted = SHOT_PX * SHOT_PX;
  check(
    drifted > THRESHOLDS.maxDiffPixels,
    `a ${SHOT_PX}x${SHOT_PX} shot differs by at most ${drifted} pixels, inside the ${THRESHOLDS.maxDiffPixels}-pixel allowance`,
  );
}

/** The canonical field order, as a comparator: a record carrying an extra key
 *  sorts it to the front (`indexOf` −1) and fails the join below. */
const byKeyOrder = (left, right) =>
  HISTORY_KEYS.indexOf(left) - HISTORY_KEYS.indexOf(right);

function verifyHistory(target) {
  const history = readJson(join(target, 'history.json'));
  const outcomes = new Set();

  for (const record of history) {
    check(
      HISTORY_KEYS.join() === Object.keys(record).sort(byKeyOrder).join(),
      `history record ${record.id} does not carry exactly ${HISTORY_KEYS.join(', ')}`,
    );
    outcomes.add(record.exitCode);
  }

  // The four outcome words the console derives (lib/outcome.ts): 0, 1, anything
  // above, and the null an interrupted run keeps.
  for (const exitCode of [0, 1, 2, null]) {
    check(outcomes.has(exitCode), `no history record exits ${exitCode}`);
  }
}

/** A report's chips have to add up to the cards under them: every bucket but
 *  `unchanged` is one variant in the array, and `unchanged` is only ever the
 *  count the differ left behind. */
function verifyCounts(reportId, { counts, variants }) {
  const present = variants.length + counts.unchanged;
  const counted = Object.values(counts).reduce((sum, count) => sum + count, 0);

  check(
    present === counted,
    `${reportId}: ${counted} counted, ${present} variants + unchanged`,
  );
}

function verifyReport(target, graft) {
  const summary = readJson(join(target, 'reports', graft.report, 'summary.json'));

  verifyCounts(graft.report, summary);
  check(summary.counts.a11y > 0, `${graft.report} carries no accessibility failure`);
  check(summary.counts.removed > 0, `${graft.report} carries no removed variant`);
  check(
    summary.warnings.some((warning) => warning.includes('unstable')),
    `${graft.report} carries no warning about an unstable story`,
  );
  // The skipped-story line the report scenario asserts a reviewer is shown. This
  // one is NOT fabricated: the committed fixture is a real report, and a real run
  // emits the skip line, so the warning arrives through the copy rather than the
  // overlay. That is exactly why it needs asserting here — a warning nothing owns
  // is a warning a future fixture refresh can drop without anything noticing, and
  // the scenario downstream would then pass or fail on data no one chose.
  //
  // Matched on SKIP_TAG rather than on the sentence, so renaming the tag fails the
  // seed instead of quietly leaving the fixture describing a tag that is gone.
  check(
    summary.warnings.some((warning) => warning.includes(`skipped by ${SKIP_TAG}`)),
    `${graft.report} carries no warning about a skipped story`,
  );
}

function existsAsFile(file) {
  try {
    return statSync(file).isFile();
  } catch {
    return false;
  }
}

/**
 * The accept report, against what an accept actually reads.
 *
 * `promoteBaselines` reads one candidate shot per reviewable variant before it
 * writes a byte and refuses the whole accept over a missing one, so a seed that
 * is one shot short fails the scenario as a refusal — which reads as the gate
 * working rather than as a thin seed.
 */
function verifyAcceptReport(target, accept, sets, shots) {
  const labels = sets.map((set) => set.label);
  const sides = accept.report.split('__');
  check(
    sides.length === 2 && sides.every((side) => labels.includes(side)),
    `${accept.report} does not name two registered capture sets`,
  );

  verifyCounts(accept.report, accept);
  check(
    accept.counts.a11y === 0,
    `${accept.report} carries an accessibility failure — the accept gate refuses that before it asks anything else, so the review and host scenarios could never reach their answers`,
  );

  const dir = join(target, 'reports', accept.report, 'shots');
  for (const { key } of accept.variants) {
    check(
      shots.variants.includes(key),
      `${key} is not a seeded variant, so an accept would promote a baseline no set holds`,
    );
    check(
      existsAsFile(join(dir, `${key}.candidate.png`)),
      `${accept.report} has no candidate shot for ${key} — the accept would refuse rather than run`,
    );
  }
}

function verify(target, overlay, mutating) {
  verifyShots(overlay.shots);
  verifySets(target, overlay.sets);
  verifyHistory(target);
  verifyReport(target, overlay.graft);
  verifyAcceptReport(target, overlay.accept, overlay.sets, overlay.shots);

  const registry = join(target, 'worktrees.json');
  check(
    existsAsFile(registry) !== mutating,
    mutating
      ? 'the mutating world registered a worktree — the prune it owns would skip that set'
      : 'the seeded world registered no worktree, so no delete can be refused',
  );
}

// ---- The script -----------------------------------------------------------

function parseArgs(argv) {
  const flags = argv.filter((arg) => arg.startsWith('--'));
  const [dir, ...extra] = argv.filter((arg) => !arg.startsWith('--'));

  if (!dir || extra.length > 0)
    fail('usage: seed-visual-diff.mjs <target-dir> [--mutating|--empty]');
  for (const flag of flags) {
    if (flag !== '--mutating' && flag !== '--empty') fail(`unknown flag ${flag}`);
  }

  return {
    target: resolve(dir),
    mutating: flags.includes('--mutating'),
    empty: flags.includes('--empty'),
  };
}

const { target, mutating, empty } = parseArgs(process.argv.slice(2));

// Wiped, always. A world that survived the last run is a world the last run may
// have deleted half of, and a suite whose first scenario depends on that is a
// suite that passes locally and fails on a fresh clone.
rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });

if (empty) {
  // The sample world seeds nothing. An empty data directory is what a deployed
  // instance that has captured nothing looks like, and the app falls back to
  // its committed fixtures and badges itself — which is the state under test.
  console.log(`✓ seed-visual-diff — ${target} is empty (sample mode)`);
} else {
  const overlay = readOverlay();

  cpSync(FIXTURES, target, { recursive: true });
  writeJson(join(target, 'sets.json'), { sets: overlay.sets });
  writeJson(join(target, 'history.json'), overlay.history);
  if (!mutating) writeJson(join(target, 'worktrees.json'), overlay.worktrees);
  graftReport(target, overlay.graft);
  writeShotTrees(target, overlay.sets, overlay.shots);
  // After the shot trees: the accept report's two sides are copied out of them.
  writeAcceptReport(target, overlay.accept, runProvenance(target, overlay.graft.report));
  if (mutating) writeBaselines(target, overlay.shots, overlay.baselineEnv);

  verify(target, overlay, mutating);
  console.log(
    `✓ seed-visual-diff — ${target}: ${overlay.sets.length} sets, ${overlay.history.length} runs${mutating ? ', baselines, no worktree hold' : ', one worktree hold'}`,
  );
}
