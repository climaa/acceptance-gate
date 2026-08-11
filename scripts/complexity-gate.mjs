// Cognitive-complexity gate. Fails if any function in the target scope exceeds
// the ceiling.
//
// COGNITIVE, not cyclomatic, on purpose. Cyclomatic counts every branch, so a
// thorough-but-flat validator (a sequence of guard-returns) scores high while
// reading top to bottom; cognitive weights nesting, the actual readability
// signal. See the parsePlan / parseOverrideLabels / collectStrandedIssues
// refactors that motivated this gate.
//
// Two modes:
//   node scripts/complexity-gate.mjs                 → WORKSPACE mode. cwd is a
//     turbo workspace dir; fallow is scoped to that workspace (`--workspace`),
//     so every finding it returns belongs to it. This is what `turbo run health`
//     runs per app, cached/parallel.
//   node scripts/complexity-gate.mjs --scope <path>  → PATH mode. Analyze the
//     repo and filter findings to a path prefix. Used for `.sandcastle/`, which
//     is orchestrator scripts (tsx), not a turbo workspace.
//
// fallow has no per-function pass/fail exit code (`fallow health` exits 1 on any
// advisory finding; --min-score gates the whole-project score), so the ceiling
// decision lives here.
//
// fallow is a pinned root devDependency, invoked as the locally installed
// binary — never `npx --yes fallow@<version>`. `turbo run health` runs this
// script for every workspace in parallel within one job; `npx --yes` re-fetches
// and re-extracts the same versioned package into one shared npx cache
// directory per invocation, and concurrent extractions of that one directory
// corrupt each other's install (seen in CI as ENOTEMPTY, missing files
// mid-extraction, and failed binary-signature verification, depending on which
// step of the race two processes collided on). The locally installed binary is
// extracted exactly once, by `pnpm install`, before any workspace's `health`
// task runs — there is nothing left for parallel invocations to race over.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';

const MAX_COGNITIVE = 20;

function repoRoot(start) {
  let dir = start;
  while (dir !== dirname(dir)) {
    if (existsSync(resolve(dir, 'pnpm-workspace.yaml'))) return dir;
    dir = dirname(dir);
  }
  return start;
}

const root = repoRoot(process.cwd());
const scopeIdx = process.argv.indexOf('--scope');
const scopeArg = scopeIdx !== -1 ? process.argv[scopeIdx + 1] : null;

let label;
let fallowArgs;
let keep;
if (scopeArg) {
  const prefix = scopeArg.endsWith('/') ? scopeArg : `${scopeArg}/`;
  label = prefix;
  fallowArgs = ['health', '--format', 'json', '--quiet'];
  keep = (f) => (f.path ?? '').startsWith(prefix);
} else {
  const ws = relative(root, process.cwd()) || '.';
  label = `${ws}/`;
  fallowArgs = ['health', '--workspace', ws, '--format', 'json', '--quiet'];
  keep = () => true; // --workspace already scoped fallow to this workspace
}

function fallowBin() {
  const bin = resolve(root, 'node_modules', '.bin', 'fallow');

  if (!existsSync(bin)) {
    throw new Error(`fallow binary not found at ${bin} — run \`pnpm install\` first.`);
  }

  return bin;
}

function fallowJson() {
  try {
    return execFileSync(fallowBin(), fallowArgs, {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (err) {
    // `fallow health` exits 1 whenever it has advisory findings — not our gate.
    // The JSON is still on stdout; drive the gate off it.
    if (err.stdout) return err.stdout.toString();
    throw err;
  }
}

const data = JSON.parse(fallowJson());
const findings = Array.isArray(data.findings) ? data.findings : [];
const offenders = findings
  .filter((f) => keep(f) && (f.cognitive ?? 0) > MAX_COGNITIVE)
  .sort((a, b) => b.cognitive - a.cognitive);

if (offenders.length > 0) {
  console.error(`✗ cognitive-complexity ceiling (${MAX_COGNITIVE}) exceeded in ${label}`);
  for (const f of offenders) {
    console.error(`    cog ${f.cognitive}  ${f.name}  (${f.path}:${f.line})`);
  }
  console.error(
    '  Extract a helper to lower cognitive load, or — if the complexity is ' +
      'genuinely warranted — raise MAX_COGNITIVE in this file with a note why.',
  );
  process.exit(1);
}

console.log(`✓ ${label} complexity OK — no function over cognitive ${MAX_COGNITIVE}.`);
