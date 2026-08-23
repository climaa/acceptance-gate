// The lane-agnostic half of the suite-integrity guard.
//
// Two lanes run Gherkin in this workspace and both can be hollowed out the same
// ways, so the checks live here once and each entry point supplies what differs:
// which config to list, which directory holds its `.feature` files, how many
// scenarios it must have, and any tag rule of its own.
//
// What it costs: `playwright test --list` skips createGlobalSetupTasks, so
// nothing here boots a web server or needs a browser binary. The whole check is
// hermetic and takes about a second.
//
// The four ways a green run can mean nothing, and what catches each:
//   scenarios deleted, or filtered out at generation time by a `tags:`
//     expression in defineBddConfig
//                                → expected count, exact equality
//   @skip / @fixme / a
//     `missingSteps: skip-scenario` or `skip: true` regression
//                                → every listed test's expectedStatus
//   a project that runs nothing  → project coverage
//   @fail, @retries:N, @only …   → the .feature scan; @fail and @retries:N in
//                                  particular never appear in --list output at
//                                  all (one inverts the expectation inside the
//                                  test body, the other compiles to a
//                                  test.describe.configure wrapper)
//
// `@mode:serial` is the one control tag a lane may declare, and it is not a
// fifth way: the scenarios it skips are skipped only AFTER a failure, so the run
// carrying them is already red. What it can hide is coupling — a file whose
// scenarios silently depend on each other's leftovers — which is why a lane must
// name the flow files that carry it rather than leaving the tag droppable
// anywhere. See `serialFeatures`.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * playwright-bdd's control vocabulary (dist/generate/specialTags.js). A denylist
 * is safe here because the repo declares the tag vocabulary each lane uses, so
 * anything in this list is out of bounds by construction. Entries ending in `:`
 * are prefixes; the rest match whole tags.
 */
export const CONTROL_TAGS = [
  '@only',
  '@skip',
  '@fixme',
  '@fail',
  '@slow',
  '@retries:',
  '@timeout:',
  '@mode:',
];

function bin(workspace, name, fail) {
  const path = resolve(workspace, 'node_modules', '.bin', name);

  if (!existsSync(path)) {
    fail([`${name} binary not found at ${path} — run \`pnpm install\` first.`]);
  }

  return path;
}

/**
 * `--list` reads the generated specs, never the .feature files, so a stale
 * output directory is exactly the state that hides what is being guarded here:
 * delete a feature file and the guard would keep counting yesterday's scenarios.
 * Regenerating is idempotent and costs half a second.
 */
function regenerateSpecs(lane, fail) {
  const args = lane.config ? ['-c', lane.config] : [];
  try {
    execFileSync(bin(lane.workspace, 'bddgen', fail), args, {
      cwd: lane.workspace,
      stdio: 'pipe',
    });
  } catch (err) {
    // Both configs throw by design in some environments — CI meets E2E_BASE_URL
    // in one, CI at all in the other — and bddgen loads the config, so this path
    // carries a real message rather than a spawn stack.
    fail([(err.stderr?.toString() || err.message).trim()]);
  }
}

/** The `--list` report: every test Playwright would collect, none of them run. */
function listReport(lane, fail) {
  regenerateSpecs(lane, fail);

  const args = ['test', '--list', '--forbid-only', '--reporter=json'];
  if (lane.config) args.push('--config', lane.config);

  try {
    return JSON.parse(
      execFileSync(bin(lane.workspace, 'playwright', fail), args, {
        cwd: lane.workspace,
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

/** `features/local/console.feature.spec.js` → `features/local/console.feature`,
 *  the file a reader of the failure has to open. */
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

function checkScenarioCount(scenarios, expected, constant) {
  if (scenarios.size === expected) return [];

  const listed = [...scenarios.keys()].map((key) => `\n      ${key}`).join('');

  return [`${scenarios.size} scenarios listed, ${constant} is ${expected}${listed}`];
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
 *  a project. Tagging every scenario `@desktop` leaves the count intact and
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
 *  Feature's tags, which is how a tag on the Feature plus one on a scenario can
 *  combine into an exclusion neither says on its own. */
export function parseFeature(text) {
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

/** The one control tag a lane may declare, and only on a file it named. */
const SERIAL_TAG = '@mode:serial';

function isControlTag({ tag }) {
  const lowered = tag.toLowerCase();

  return CONTROL_TAGS.some((control) =>
    control.endsWith(':') ? lowered.startsWith(control) : lowered === control,
  );
}

/**
 * Literal scan, deliberately stricter than playwright-bdd's own matching (which
 * is case-sensitive for the flags and case-insensitive for `@retries:` and
 * friends): a `@Skip` that does nothing today is still someone reaching for the
 * mechanism.
 *
 * `@mode:serial` is exempt on the Feature node of a file the lane declared in
 * `serialFeatures` — and nowhere else. On a scenario it is exempt from nothing:
 * playwright-bdd applies `@mode:` per feature and IGNORES it on a single
 * scenario, so a scenario carrying it reads as coupled and runs as isolated,
 * which is the silent no-op this whole denylist exists to catch. The other two
 * modes stay refused outright: a `@mode:parallel` would decouple a flow that
 * reads as one.
 */
function checkControlTags(file, feature, serial) {
  const nodes = [
    { on: 'the Feature', tags: feature.featureTags, isFeature: true },
    ...feature.scenarios.map((scenario) => ({
      on: `"${scenario.title}"`,
      tags: scenario.tags,
      isFeature: false,
    })),
  ];

  return nodes.flatMap(({ on, tags, isFeature }) =>
    tags
      .filter(isControlTag)
      .filter(({ tag }) => !(isFeature && serial && tag.toLowerCase() === SERIAL_TAG))
      .map(({ tag, line }) => {
        const why =
          tag.toLowerCase() === SERIAL_TAG
            ? serial
              ? 'applies to a whole feature; playwright-bdd ignores it here'
              : "couples a file's scenarios into one flow — name the file in the " +
                "lane's serialFeatures to declare that"
            : 'is playwright-bdd control vocabulary';

        return `${file}:${line} — ${tag} on ${on} ${why}`;
      }),
  );
}

/** An allowlist that stops being used stops being a decision. A file named in
 *  `serialFeatures` and not carrying the tag is either a flow that quietly
 *  decoupled or an entry nobody removed; both read as "serial is permitted
 *  here" to the next person. */
function checkSerialDeclared(file, feature) {
  const declared = feature.featureTags.some(
    ({ tag }) => tag.toLowerCase() === SERIAL_TAG,
  );
  if (declared) return [];

  return [
    `${file} is named in serialFeatures but its Feature carries no ${SERIAL_TAG} — ` +
      `either tag it or drop it from the list`,
  ];
}

function checkFeatureFiles(lane) {
  const dir = join(lane.workspace, lane.featuresDir);
  const files = readdirSync(dir, { recursive: true }).filter((f) =>
    String(f).endsWith('.feature'),
  );

  // A scan that matches zero files passes forever while protecting nothing.
  if (files.length === 0) return [`no .feature files found under ${dir}`];

  // Accumulated, never returned early: a serialFeatures entry left behind by a
  // rename is a finding, and so is the `@skip` someone added in the same PR.
  // Returning here would report the first and hide the second until the first
  // was fixed.
  const named = files.map(String);
  const missing = (lane.serialFeatures ?? [])
    .filter((file) => !named.includes(file))
    .map((file) => `${lane.featuresDir}/${file} is in serialFeatures but does not exist`);

  const serialFeatures = new Set(lane.serialFeatures ?? []);

  return missing.concat(
    files.flatMap((file) => {
      const relative = `${lane.featuresDir}/${file}`;
      const feature = parseFeature(readFileSync(join(dir, file), 'utf8'));
      const serial = serialFeatures.has(String(file));

      return [
        ...checkControlTags(relative, feature, serial),
        ...(serial ? checkSerialDeclared(relative, feature) : []),
        ...(lane.checkTags?.(relative, feature) ?? []),
      ];
    }),
  );
}

/**
 * Every `.feature` file under `root` must live in one of the declared lanes.
 *
 * The lane globs are narrow on purpose — `features/acceptance/**` and
 * `features/local/**` — which leaves a gap neither lane's own checks can see: a
 * file at `features/whatever.feature` is compiled by no config, so it is listed
 * by no `--list`, counted by no scenario total, and scanned by no tag rule. It
 * is a product requirement that runs nowhere, and it reads exactly like one that
 * runs. Nothing else in this file would notice it, so this does.
 */
export function checkLaneCoverage(root, lanes) {
  const files = readdirSync(root, { recursive: true })
    .map(String)
    .filter((file) => file.endsWith('.feature'));

  return files
    .filter((file) => !lanes.some((lane) => file.startsWith(`${lane}/`)))
    .map(
      (file) =>
        `features/${file} is in no lane — it is compiled by no config, so no ` +
        `scenario count or tag rule can see it. Move it under ${lanes
          .map((lane) => `features/${lane}/`)
          .join(' or ')}.`,
    );
}

/**
 * Run every check for one lane and exit non-zero on the first set of findings.
 *
 * @param {object} lane
 * @param {string} lane.workspace       absolute path to `apps/e2e`
 * @param {string} [lane.config]        `--config` to pass; omitted uses the default
 * @param {string} lane.featuresDir     workspace-relative dir holding the .feature files
 * @param {number} lane.expected        exact scenario count
 * @param {string} lane.expectedName    the constant's name, for the failure message
 * @param {string} lane.name            what to call the lane in output
 * @param {string[]} [lane.serialFeatures] featuresDir-relative files allowed to
 *                                     carry `@mode:serial` on their Feature
 * @param {Function} [lane.checkTags]   extra per-file tag rule
 * @param {Function} [lane.extraChecks] whole-tree checks this lane owns
 */
export function runIntegrityCheck(lane) {
  const fail = (failures) => {
    console.error(`✗ ${lane.name} integrity`);
    for (const failure of failures) console.error(`    ${failure}`);
    console.error(
      '  A .feature file is a product requirement (apps/e2e/README.md): the suite is ' +
        'hardened to match it, never narrowed to pass.',
    );
    process.exit(1);
  };

  const report = listReport(lane, fail);

  // A refused run lists nothing, so every check below would report the same
  // refusal as more findings. Deduped because Playwright repeats a load error
  // once per project.
  const loadErrors = [
    ...new Set(
      (report.errors ?? []).map(
        (error) => error.message?.split('\n')[0] ?? String(error),
      ),
    ),
  ];
  if (loadErrors.length > 0) fail(loadErrors);

  const specs = report.suites.flatMap((suite) => flattenSpecs(suite));
  const scenarios = scenariosByProject(specs);

  const failures = [
    ...checkScenarioCount(scenarios, lane.expected, lane.expectedName),
    ...checkExpectedStatus(specs),
    ...checkProjectCoverage(scenarios, report.config.projects),
    ...checkFeatureFiles(lane),
    ...(lane.extraChecks?.() ?? []),
  ];

  if (failures.length > 0) fail(failures);

  console.log(
    `✓ ${lane.name} integrity OK — ${scenarios.size} scenarios, ${specs.length} tests, all expected to pass.`,
  );
}
