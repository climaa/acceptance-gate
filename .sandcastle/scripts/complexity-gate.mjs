// CI gate: fail if any function in .sandcastle/ exceeds the cognitive-complexity
// ceiling.
//
// COGNITIVE, not cyclomatic, on purpose. Cyclomatic counts every branch, so a
// thorough-but-flat validator (a sequence of guard-returns) scores high while
// reading top-to-bottom; cognitive weights nesting, which is the actual
// readability signal. See the parsePlan/parseOverrideLabels/collectStrandedIssues
// refactors that motivated this gate.
//
// fallow has no per-path scope flag and no per-function pass/fail exit code
// (`fallow health` exits 1 on ANY advisory finding; --min-score gates the whole
// project's score), so we drive off its JSON and decide here — scoped to
// .sandcastle/ so it never gates unrelated packages.
import { execFileSync } from 'node:child_process';

const MAX_COGNITIVE = 20;
const SCOPE = '.sandcastle/';
const FALLOW_VERSION = '2.99.0';

function fallowHealthJson() {
  try {
    return execFileSync(
      'npx',
      ['--yes', `fallow@${FALLOW_VERSION}`, 'health', '--format', 'json', '--quiet'],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
    );
  } catch (err) {
    // `fallow health` exits 1 whenever it has advisory findings — that is not
    // our gate. The JSON is still on stdout; drive the gate off it.
    if (err.stdout) return err.stdout.toString();
    throw err;
  }
}

const data = JSON.parse(fallowHealthJson());
const findings = Array.isArray(data.findings) ? data.findings : [];
const offenders = findings
  .filter((f) => (f.path ?? '').startsWith(SCOPE) && (f.cognitive ?? 0) > MAX_COGNITIVE)
  .sort((a, b) => b.cognitive - a.cognitive);

if (offenders.length > 0) {
  console.error(`✗ cognitive-complexity ceiling (${MAX_COGNITIVE}) exceeded in ${SCOPE}:`);
  for (const f of offenders) {
    console.error(`    cog ${f.cognitive}  ${f.name}  (${f.path}:${f.line})`);
  }
  console.error(
    '  Extract a helper to lower cognitive load, or — if the complexity is ' +
      'genuinely warranted — raise MAX_COGNITIVE in this file with a note why.',
  );
  process.exit(1);
}

console.log(`✓ ${SCOPE} complexity OK — no function over cognitive ${MAX_COGNITIVE}.`);
