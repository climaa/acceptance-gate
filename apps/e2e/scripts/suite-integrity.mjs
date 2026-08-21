// Suite-integrity guard. Fails if the acceptance suite still exits 0 while
// claiming less than it did.
//
// `apps/e2e/README.md` already says a `.feature` file is a product requirement
// and is never edited to make a test pass. That is prose, and prose is not a
// tripwire — this file is. It runs before `playwright test` in `test:e2e`, so a
// suite that has been quietly narrowed fails the check that was supposed to
// exercise it rather than passing it.
//
// What it costs: `playwright test --list` skips createGlobalSetupTasks, so
// nothing here boots the web server or needs a browser binary. The whole check
// is hermetic and takes about a second.
//
// The four ways a green run can mean nothing, and what catches each:
//   scenarios deleted, or filtered out at generation time by a `tags:`
//     expression in defineBddConfig
//                                → EXPECTED_SCENARIOS, exact equality
//   @skip / @fixme / a
//     `missingSteps: skip-scenario` or `skip: true` regression
//                                → every listed test's expectedStatus
//   a project that runs nothing  → project coverage
//   @fail, @retries:N, @only …   → the .feature scan; @fail and @retries:N in
//                                  particular never appear in --list output at
//                                  all (one inverts the expectation inside the
//                                  test body, the other compiles to a
//                                  test.describe.configure wrapper)
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Scenarios, not Playwright tests: 9 blog + 9 visual-diff console + 3 sample
 * mode + 15 report + 7 accessibility + 4 baseline acceptance. Test count is
 * higher, because an untagged scenario is listed once per project; one
 * legitimate `@desktop` lowers that number without removing a requirement,
 * which would train everyone to edit this constant for a non-event. Scenario
 * count moves only when a requirement is added or removed.
 *
 * Exact equality, not a floor: a floor decays, and after ten more scenarios a
 * floor of 47 would permit deleting ten of them. Raising this alongside a new
 * scenario is a two-line diff; LOWERING it is a product decision and belongs in
 * its own hand-authored PR with the reason written down.
 */
const EXPECTED_SCENARIOS = 47;

/**
 * playwright-bdd's control vocabulary (dist/generate/specialTags.js). A denylist
 * is safe here because the repo declares the tag vocabulary it uses — `@desktop`
 * and `@mobile`, per README.md — so anything in this list is out of bounds by
 * construction. Entries ending in `:` are prefixes; the rest match whole tags.
 */
const CONTROL_TAGS = [
  '@only',
  '@skip',
  '@fixme',
  '@fail',
  '@slow',
  '@retries:',
  '@timeout:',
  '@mode:',
];

/** The two project selectors. Carrying both excludes a scenario from both. */
const PROJECT_TAGS = ['@desktop', '@mobile'];

function bin(name) {
  const path = resolve(workspace, 'node_modules', '.bin', name);

  if (!existsSync(path)) {
    fail([`${name} binary not found at ${path} — run \`pnpm install\` first.`]);
  }

  return path;
}

function fail(failures) {
  console.error('✗ acceptance-suite integrity');
  for (const failure of failures) console.error(`    ${failure}`);
  console.error(
    '  A .feature file is a product requirement (apps/e2e/README.md): the suite is ' +
      'hardened to match it, never narrowed to pass.',
  );
  process.exit(1);
}

/**
 * `--list` reads the generated specs, never the .feature files, so a stale
 * `.features-gen/` is exactly the state that hides what is being guarded here:
 * delete a feature file and the guard would keep counting yesterday's eight
 * scenarios. `test:e2e` runs bddgen too, so the pipeline still reads in order;
 * regenerating is idempotent and costs half a second.
 */
function regenerateSpecs() {
  try {
    execFileSync(bin('bddgen'), [], { cwd: workspace, stdio: 'pipe' });
  } catch (err) {
    // playwright.config.ts throws by design when CI meets E2E_BASE_URL, and
    // bddgen loads that config — so this path carries a real message, not a
    // spawn stack.
    fail([(err.stderr?.toString() || err.message).trim()]);
  }
}

/** The `--list` report: every test Playwright would collect, none of them run. */
function listReport() {
  regenerateSpecs();

  const args = ['test', '--list', '--forbid-only', '--reporter=json'];
  try {
    return JSON.parse(
      execFileSync(bin('playwright'), args, {
        cwd: workspace,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
      }),
    );
  } catch (err) {
    // A refused run is a finding, not a crash: `--forbid-only` exits 1 with the
    // offending scenario named in the report's own `errors`, which reads better
    // than the stack of the spawn that carried it.
    const stdout = err.stdout?.toString() ?? '';
    if (!stdout.startsWith('{')) fail([(err.stderr?.toString() || err.message).trim()]);

    return JSON.parse(stdout);
  }
}

/** Playwright nests one suite per file and one per describe block. */
function flattenSpecs(suite, out = []) {
  for (const spec of suite.specs ?? []) out.push(spec);
  for (const child of suite.suites ?? []) flattenSpecs(child, out);

  return out;
}

/** `features/blog.feature.spec.js` → `features/blog.feature`, the file a reader
 *  of the failure has to open. */
function scenarioKey(spec) {
  return `${spec.file.replace(/\.spec\.[cm]?[jt]s$/, '')} › ${spec.title}`;
}

/** Distinct scenario → the projects that will run it. One entry per project per
 *  scenario comes back from `--list`; a scenario excluded from every project
 *  comes back not at all, which is what makes the count check load-bearing. */
function scenariosByProject(specs) {
  const scenarios = new Map();
  for (const spec of specs) {
    const key = scenarioKey(spec);
    const projects = scenarios.get(key) ?? new Set();
    for (const test of spec.tests ?? []) projects.add(test.projectName);
    scenarios.set(key, projects);
  }

  return scenarios;
}

function checkScenarioCount(scenarios) {
  if (scenarios.size === EXPECTED_SCENARIOS) return [];

  const listed = [...scenarios.keys()].map((key) => `\n      ${key}`).join('');

  return [
    `${scenarios.size} scenarios listed, EXPECTED_SCENARIOS is ${EXPECTED_SCENARIOS}${listed}`,
  ];
}

/** `@skip` and `@fixme` both emit a test that is collected, listed and counted,
 *  and never runs — the suite stays green and nothing notices. */
function checkExpectedStatus(specs) {
  const failures = [];
  for (const spec of specs) {
    for (const test of spec.tests ?? []) {
      if (test.expectedStatus === 'passed') continue;
      failures.push(
        `${scenarioKey(spec)} [${test.projectName}] expects "${test.expectedStatus}", not "passed"`,
      );
    }
  }

  return failures;
}

/** Every configured project must run something, and every scenario must land in
 *  a project. Tagging all eight scenarios `@desktop` leaves the count at 8 and
 *  every expectedStatus at "passed" while `mobile` silently runs nothing. */
function checkProjectCoverage(scenarios, configuredProjects) {
  const covered = new Set([...scenarios.values()].flatMap((projects) => [...projects]));
  const failures = [...scenarios]
    .filter(([, projects]) => projects.size === 0)
    .map(([key]) => `${key} runs in no project`);

  for (const project of configuredProjects) {
    if (!covered.has(project.name)) {
      failures.push(`project "${project.name}" runs nothing`);
    }
  }

  return failures;
}

/** Own tags per node, with the line each was written on. A scenario inherits its
 *  Feature's tags, which is how `@desktop` on the Feature plus `@mobile` on one
 *  scenario hides that scenario from both projects. */
function parseFeature(text) {
  const scenarios = [];
  let featureTags = [];
  let pending = [];

  text.split('\n').forEach((raw, index) => {
    const line = raw.trim();
    if (line.startsWith('@')) {
      pending.push(...line.split(/\s+/).map((tag) => ({ tag, line: index + 1 })));
      return;
    }

    const node = line.match(/^(Feature|Scenario Outline|Scenario|Example):\s*(.*)$/);
    if (!node) return;

    if (node[1] === 'Feature') featureTags = pending;
    else scenarios.push({ title: node[2], tags: pending });
    pending = [];
  });

  return { featureTags, scenarios };
}

function isControlTag({ tag }) {
  const lowered = tag.toLowerCase();

  return CONTROL_TAGS.some((control) =>
    control.endsWith(':') ? lowered.startsWith(control) : lowered === control,
  );
}

/** Literal scan, deliberately stricter than playwright-bdd's own matching (which
 *  is case-sensitive for the flags and case-insensitive for `@retries:` and
 *  friends): a `@Skip` that does nothing today is still someone reaching for the
 *  mechanism. */
function checkControlTags(file, feature) {
  const nodes = [
    { on: 'the Feature', tags: feature.featureTags },
    ...feature.scenarios.map((scenario) => ({
      on: `"${scenario.title}"`,
      tags: scenario.tags,
    })),
  ];

  return nodes.flatMap(({ on, tags }) =>
    tags
      .filter(isControlTag)
      .map(
        ({ tag, line }) =>
          `${file}:${line} — ${tag} on ${on} is playwright-bdd control vocabulary`,
      ),
  );
}

/** `desktop` carries grepInvert /@mobile/ and `mobile` carries /@desktop/, so a
 *  scenario with both is excluded from both — while every other scenario still
 *  runs, so Playwright's "No tests found" never fires. Two words, one
 *  requirement gone. Named here rather than left to surface as a count of 7. */
function checkProjectTags(file, feature) {
  const inherited = feature.featureTags;

  return feature.scenarios
    .filter(({ tags }) =>
      PROJECT_TAGS.every((wanted) =>
        [...inherited, ...tags].some(({ tag }) => tag === wanted),
      ),
    )
    .map(({ title, tags }) => {
      // Own tag first; a scenario that inherits both from the Feature has none.
      const line = (tags[0] ?? inherited[0]).line;

      return `${file}:${line} — "${title}" is tagged @desktop and @mobile, so both projects exclude it`;
    });
}

function checkFeatureFiles() {
  const dir = join(workspace, 'features');
  const files = readdirSync(dir, { recursive: true }).filter((f) =>
    f.endsWith('.feature'),
  );

  // A scan that matches zero files passes forever while protecting nothing.
  if (files.length === 0) return [`no .feature files found under ${dir}`];

  return files.flatMap((file) => {
    const feature = parseFeature(readFileSync(join(dir, file), 'utf8'));

    return [
      ...checkControlTags(`features/${file}`, feature),
      ...checkProjectTags(`features/${file}`, feature),
    ];
  });
}

const report = listReport();

// A refused run lists nothing, so every check below would report the same
// refusal as eight more findings. Deduped because Playwright repeats a load
// error once per project.
const loadErrors = [
  ...new Set(
    (report.errors ?? []).map((error) => error.message?.split('\n')[0] ?? String(error)),
  ),
];
if (loadErrors.length > 0) fail(loadErrors);

const specs = report.suites.flatMap((suite) => flattenSpecs(suite));
const scenarios = scenariosByProject(specs);

const failures = [
  ...checkScenarioCount(scenarios),
  ...checkExpectedStatus(specs),
  ...checkProjectCoverage(scenarios, report.config.projects),
  ...checkFeatureFiles(),
];

if (failures.length > 0) fail(failures);

console.log(
  `✓ suite integrity OK — ${scenarios.size} scenarios, ${specs.length} tests, all expected to pass.`,
);
