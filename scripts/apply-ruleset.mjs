#!/usr/bin/env node
// Applies .github/rulesets/*.json to the repository via the GitHub API.
//
// Dry-run by default. `--apply` is the only thing that writes, because this
// script changes what can reach `main` — the one setting where a silent
// success is worse than a loud refusal.
//
// Zero-dep on purpose, like scripts/complexity-gate.mjs: it shells out to the
// `gh` CLI rather than holding a token itself, so auth is whatever the operator
// already has and nothing credential-shaped ever lands in this repo.
//
// Why a script at all, rather than a workflow: applying a ruleset needs a token
// with admin:repo scope. Handing that to Actions would put a credential capable
// of *removing* branch protection inside the same CI that protection guards.
// This runs from a maintainer's shell, deliberately.

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RULESET_DIR = join(ROOT, '.github', 'rulesets');

// The fields this repo manages. The API returns plenty more (id, source_type,
// created_at, _links, current_user_can_bypass); comparing those would report a
// diff on every run, so the comparison is scoped to what main.json actually
// declares. Stated out loud because "no changes" from this script means "no
// changes to the managed keys", not "the live ruleset is byte-identical".
const MANAGED = ['name', 'target', 'enforcement', 'bypass_actors', 'conditions', 'rules'];

const apply = process.argv.includes('--apply');

function gh(args, input) {
  try {
    return execFileSync('gh', args, {
      encoding: 'utf8',
      input,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (error) {
    // `gh` writes the useful half of an API error to stderr, and execFileSync's
    // own message is just the exit code. Surface both or debugging this means
    // re-running the command by hand.
    const detail = error.stderr?.toString().trim() || error.message;
    throw new Error(`gh ${args.join(' ')} failed:\n${detail}`);
  }
}

// nameWithOwner rather than a hardcoded climaa/acceptance-gate: a fork should
// be able to run this against itself without editing the script.
const repo = gh(['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner']).trim();

// Sort keys so the printed JSON is stable — an unstable key order would render
// as a diff on every run and train the reader to ignore the output.
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stable(value[key])]),
    );
  }
  return value;
}

const managedOnly = (obj) =>
  stable(Object.fromEntries(MANAGED.filter((k) => k in obj).map((k) => [k, obj[k]])));

const live = JSON.parse(gh(['api', `repos/${repo}/rulesets`, '--paginate']));

let changed = 0;

for (const file of readdirSync(RULESET_DIR).filter((f) => f.endsWith('.json'))) {
  const desired = JSON.parse(readFileSync(join(RULESET_DIR, file), 'utf8'));

  // Matched by name, not id: ids are assigned by GitHub and are not knowable
  // at author time, so committing one would make this file environment-specific
  // and useless to a fork. The cost is documented in the README — renaming a
  // ruleset creates a second one instead of updating the first.
  const existing = live.find((r) => r.name === desired.name);

  // The list endpoint returns a summary without `rules`; only the by-id
  // endpoint has the full object. Fetch it, or every existing ruleset reads as
  // a diff on its entire rule set.
  const current = existing
    ? JSON.parse(gh(['api', `repos/${repo}/rulesets/${existing.id}`]))
    : null;

  const want = JSON.stringify(managedOnly(desired), null, 2);
  const have = current ? JSON.stringify(managedOnly(current), null, 2) : null;

  if (have === want) {
    console.log(`✓ ${file}: live ruleset matches (managed keys)`);
    continue;
  }

  changed += 1;
  console.log(`\n${current ? '~' : '+'} ${file}: ${current ? 'differs' : 'does not exist yet'}`);
  if (current) {
    console.log('--- live (managed keys)');
    console.log(have);
  }
  console.log('+++ desired');
  console.log(want);

  if (!apply) continue;

  const body = JSON.stringify(desired);
  if (current) {
    gh(['api', '--method', 'PUT', `repos/${repo}/rulesets/${current.id}`, '--input', '-'], body);
    console.log(`applied: updated ruleset ${current.id} (${desired.name})`);
  } else {
    gh(['api', '--method', 'POST', `repos/${repo}/rulesets`, '--input', '-'], body);
    console.log(`applied: created ruleset ${desired.name}`);
  }
}

if (changed === 0) {
  console.log('\nNothing to do.');
} else if (!apply) {
  console.log(`\n${changed} ruleset(s) would change. Re-run with --apply to write.`);
  // Exit 1 on drift so this can be run as a check later without rewriting it:
  // "the committed ruleset does not match the live one" is a failure state, the
  // same way `prettier --check` treats unformatted code.
  process.exit(1);
}
