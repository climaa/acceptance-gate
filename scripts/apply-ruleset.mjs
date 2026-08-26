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
// This runs from a maintainer's shell, deliberately. (A read-only drift check
// is a different question — `permissions: { administration: read }` cannot
// write — and is tracked separately.)

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RULESET_DIR = join(ROOT, '.github', 'rulesets');

// The top-level fields this repo manages. Everything else the API returns (id,
// source_type, created_at, _links, current_user_can_bypass) is GitHub's, not
// ours, and is ignored.
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
    // BOTH streams, and stdout first — this is not belt-and-braces. `gh api`
    // puts the one-line "gh: Validation Failed (HTTP 422)" on stderr and the
    // JSON error body, the half naming which field is wrong, on STDOUT. The
    // rules array is a large `oneOf`, so a single mistyped parameter collapses
    // the whole variant match and GitHub answers "Invalid property /rules/2:
    // data matches no possible input." That string is the only pointer to
    // which rule failed, and reading stderr alone throws it away.
    const detail = [error.stdout?.toString().trim(), error.stderr?.toString().trim()]
      .filter(Boolean)
      .join('\n');
    throw new Error(`gh ${args.join(' ')} failed:\n${detail || error.message}`);
  }
}

// nameWithOwner rather than a hardcoded climaa/acceptance-gate: a fork should
// be able to run this against itself without editing the script.
const repo = gh([
  'repo',
  'view',
  '--json',
  'nameWithOwner',
  '-q',
  '.nameWithOwner',
]).trim();

/**
 * Is every value `want` declares present and equal in `have`?
 *
 * A SUBSET check, not equality, and that is the whole design. GitHub
 * materialises parameter defaults that main.json does not declare — live
 * `pull_request` rules come back carrying `required_reviewers`,
 * `dismissal_restriction` and `ignore_approvals_from_contributors` whether you
 * asked for them or not. Whole-object equality would therefore report drift on
 * every single run, including immediately after a successful `--apply`, and a
 * check that is always red is a check nobody reads.
 *
 * Declaring those defaults in main.json instead is the fragile answer:
 * `ignore_approvals_from_contributors` was added to the API after the fact, and
 * the next one will be too. Ignoring undeclared keys is stable across that.
 *
 * The cost, stated plainly: this cannot see a key someone adds in the web UI
 * that main.json says nothing about. It answers "is what we declared still
 * true", not "is the live ruleset identical to this file".
 */
function subsetOf(want, have, path, mismatches) {
  // An empty array we declare and GitHub omits entirely are the same state.
  // `bypass_actors: []` is the live case: it may come back absent rather than
  // empty, and treating that as drift would be a second permanent false diff.
  if (Array.isArray(want) && want.length === 0 && have === undefined) return true;

  if (Array.isArray(want)) {
    if (!Array.isArray(have) || want.length !== have.length) {
      mismatches.push(path);
      return false;
    }
    // Element-wise and positional, EXCEPT where the caller matched by identity
    // first (see `rules` below). Fine for the leaf arrays here — contexts and
    // merge methods — which are short and authored in one place.
    return want
      .map((v, i) => subsetOf(v, have[i], `${path}[${i}]`, mismatches))
      .every(Boolean);
  }

  if (want && typeof want === 'object') {
    if (!have || typeof have !== 'object') {
      mismatches.push(path);
      return false;
    }
    return Object.keys(want)
      .map((key) => subsetOf(want[key], have[key], `${path}.${key}`, mismatches))
      .every(Boolean);
  }

  if (want !== have) {
    mismatches.push(
      `${path}: want ${JSON.stringify(want)}, live ${JSON.stringify(have)}`,
    );
    return false;
  }
  return true;
}

/**
 * Compare rules by `type` rather than by array position. GitHub is not
 * documented to preserve the order rules were submitted in, and a reordering
 * that changed nothing about enforcement would otherwise read as drift.
 */
function rulesMatch(want, have, mismatches) {
  const liveByType = new Map((have ?? []).map((rule) => [rule.type, rule]));

  return want
    .map((rule) => {
      const live = liveByType.get(rule.type);
      if (!live) {
        mismatches.push(`rules.${rule.type}: missing from the live ruleset`);
        return false;
      }
      return subsetOf(rule, live, `rules.${rule.type}`, mismatches);
    })
    .every(Boolean);
}

function compare(desired, live) {
  const mismatches = [];
  let ok = true;

  for (const key of MANAGED) {
    if (!(key in desired)) continue;
    if (key === 'rules') {
      ok = rulesMatch(desired.rules, live.rules, mismatches) && ok;
    } else {
      ok = subsetOf(desired[key], live[key], key, mismatches) && ok;
    }
  }

  return { ok, mismatches };
}

// includes_parents defaults to TRUE, which would return organisation and
// enterprise rulesets inherited by this repo alongside its own. Matching one of
// those by name and then PUTting to /repos/{this}/rulesets/{orgRulesetId} is a
// state worth being unable to reach — and it is exactly the fork case the
// nameWithOwner lookup above exists to support.
const live = JSON.parse(
  gh(['api', `repos/${repo}/rulesets?includes_parents=false`, '--paginate']),
);

let changed = 0;

for (const file of readdirSync(RULESET_DIR).filter((f) => f.endsWith('.json'))) {
  const desired = JSON.parse(readFileSync(join(RULESET_DIR, file), 'utf8'));

  // Matched by name, not id: ids are assigned by GitHub and are not knowable at
  // author time, so committing one would make this file environment-specific
  // and useless to a fork. The cost is real and documented in the README — a
  // rename creates a second ruleset rather than updating the first.
  const existing = live.find((r) => r.name === desired.name);

  // The list endpoint returns a summary without `rules`; only the by-id
  // endpoint has the full object. Fetch it, or every existing ruleset reads as
  // a diff on its entire rule set.
  const current = existing
    ? JSON.parse(gh(['api', `repos/${repo}/rulesets/${existing.id}`]))
    : null;

  if (current) {
    const { ok, mismatches } = compare(desired, current);
    if (ok) {
      console.log(`✓ ${file}: live ruleset satisfies everything this file declares`);
      continue;
    }
    changed += 1;
    console.log(
      `\n~ ${file}: ${mismatches.length} mismatch(es) against ruleset ${current.id}`,
    );
    for (const line of mismatches) console.log(`    ${line}`);
  } else {
    changed += 1;
    console.log(`\n+ ${file}: no ruleset named "${desired.name}" exists yet`);
  }

  if (!apply) continue;

  const body = JSON.stringify(desired);
  if (current) {
    gh(
      ['api', '--method', 'PUT', `repos/${repo}/rulesets/${current.id}`, '--input', '-'],
      body,
    );
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
