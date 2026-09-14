// PROJECT_INDEX.md integrity gate. Fails when the index states something about
// this repository that the repository itself contradicts.
//
// WHY THIS EXISTS. The index carries a version stamp and a set of counts, and
// until now nothing read it: `grep -rl PROJECT_INDEX --include='*.ts'
// --include='*.mjs' --include='*.mts' --include='*.json'` returned nothing at
// all. So it drifted, silently, and was only ever corrected when someone
// happened to look — which at v1.4.0 nobody did, because the release PR that
// has refreshed it since 1.0.0 bumped ten manifests and stopped. An index that
// can be wrong without anything going red is documentation that has to be
// independently verified before it can be used, which costs more than it saves.
//
// WHAT IT CHECKS, AND WHY ONLY THIS MUCH. Two claims, chosen because both are
// derivable from the tree as it stands, with nothing built and no suite run:
//
//   1. The version stamp against the root package.json. The ten manifests move
//      in lockstep at release time (see RELEASING.md), so the root is the one
//      to compare against, and a stamp that disagrees with it means the index
//      describes an older repository than the one you are reading.
//   2. The committed baseline count, against the PNGs git actually tracks.
//
// The per-workspace file and test counts are deliberately NOT checked. Deriving
// them means running every suite, and a gate that needs the suites to have run
// first is slower than the thing it guards and fails for reasons that have
// nothing to do with the index. Those counts stay the release procedure's job;
// this gate covers what can be known cheaply and always.
//
// EXACT EQUALITY, NOT A FLOOR, for the same reason EXPECTED_SCENARIOS in
// apps/e2e/scripts/suite-integrity.mjs is exact: a floor decays. A baseline
// count of "at least 158" permits deleting two without a word.
//
// WHY HERE AND NOT A WORKSPACE TEST. PROJECT_INDEX.md is a repo-root artifact
// that belongs to no workspace, and a workspace test reading it would need the
// file named in that task's turbo `inputs` or the cache would answer for a
// version of the file it had not read. Run from `health:check`, alongside
// complexity-gate.mjs's --scope pass, there is no cache to mislead.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const INDEX = 'PROJECT_INDEX.md';

const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

/** The stamp reads `Version 1.4.0 · generated 2026-09-14`. */
function statedVersion(index) {
  const m = index.match(/^Version (\d+\.\d+\.\d+) · generated (\d{4}-\d{2}-\d{2})/m);

  return m ? { version: m[1], line: index.slice(0, m.index).split('\n').length } : null;
}

/** `160 committed baselines`, stated twice — the structure tree and the Tests section. */
function statedBaselines(index) {
  return [...index.matchAll(/(\d+) committed baselines/g)].map((m) => ({
    count: Number(m[1]),
    line: index.slice(0, m.index).split('\n').length,
  }));
}

// git, not readdir: the claim is about what the repository CARRIES, and a local
// run leaves untracked PNGs under __baselines__ that a directory listing would
// count. Reading the index rather than the worktree also means a half-staged
// accept cannot make this pass.
function trackedBaselines() {
  let out;

  try {
    out = execFileSync('git', ['ls-files', 'packages/visual-diff/__baselines__'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (cause) {
    throw new Error(
      `could not ask git what it tracks under packages/visual-diff/__baselines__ ` +
        `(this check reads the git index, so it needs a repository and a git binary): ` +
        `${cause.message}`,
      { cause },
    );
  }

  return out.split('\n').filter((f) => f.endsWith('.png')).length;
}

const index = read(INDEX);
const problems = [];

const stamp = statedVersion(index);
const manifest = JSON.parse(read('package.json')).version;

if (!manifest) {
  problems.push('package.json has no `version`, so the stamp has nothing to agree with');
} else if (!stamp) {
  problems.push(`${INDEX} — no \`Version X.Y.Z · generated YYYY-MM-DD\` stamp found`);
} else if (stamp.version !== manifest) {
  // The remedy names files and a document, not a slash command: this text is read
  // in a CI log by whoever is holding the failure, and telling them to run
  // something only an agent has is telling them nothing.
  problems.push(
    `${INDEX}:${stamp.line} — stamped ${stamp.version}, package.json says ${manifest}.\n` +
      `      Re-measure the index against the tree and correct every number that moved,\n` +
      `      then stamp it ${manifest}. Editing the stamp alone defeats the point: its\n` +
      `      measured before/after is the release body's index-corrections section.\n` +
      `      RELEASING.md step 4 lists the commands.`,
  );
}

const baselines = trackedBaselines();
const stated = statedBaselines(index);

if (stated.length === 0) {
  problems.push(`${INDEX} — no \`N committed baselines\` claim found`);
}

for (const claim of stated) {
  if (claim.count !== baselines) {
    problems.push(
      `${INDEX}:${claim.line} — claims ${claim.count} committed baselines, git tracks ${baselines}`,
    );
  }
}

if (problems.length > 0) {
  console.error(`✗ ${INDEX} disagrees with the repository:\n`);
  for (const p of problems) console.error(`  ${p}`);
  console.error('');
  process.exit(1);
}

console.log(
  `✓ ${INDEX} integrity OK — stamped ${manifest}, ${baselines} committed baselines.`,
);
