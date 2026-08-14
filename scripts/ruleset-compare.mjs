// The pure half of scripts/apply-ruleset.mjs: given the ruleset a file declares
// and the one the API returned, what — if anything — differs?
//
// A module of its own because apply-ruleset.mjs shells out to `gh` at import
// time, so importing it to reach these functions would run the real thing.
// Nothing here reaches past its own arguments, which is what makes the
// comparison testable at all.

// The top-level fields this repo manages. Everything else the API returns (id,
// source_type, created_at, _links, current_user_can_bypass) is GitHub's, not
// ours, and is ignored.
const MANAGED = ['name', 'target', 'enforcement', 'bypass_actors', 'conditions', 'rules'];

/**
 * Records, onto `mismatches`, every value `want` declares that `have` does not
 * carry equally.
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
function collectMismatches(want, have, path, mismatches) {
  // An empty array we declare and GitHub omits entirely are the same state.
  // `bypass_actors: []` is the live case: it may come back absent rather than
  // empty, and treating that as drift would be a second permanent false diff.
  if (Array.isArray(want) && want.length === 0 && have === undefined) return;

  if (Array.isArray(want)) {
    if (!Array.isArray(have) || want.length !== have.length) {
      mismatches.push(path);
      return;
    }
    // Element-wise and positional, EXCEPT where the caller matched by identity
    // first (see `rules` below). Fine for the leaf arrays here — contexts and
    // merge methods — which are short and authored in one place.
    want.forEach((item, index) =>
      collectMismatches(item, have[index], `${path}[${index}]`, mismatches),
    );
    return;
  }

  if (want && typeof want === 'object') {
    if (!have || typeof have !== 'object') {
      mismatches.push(path);
      return;
    }
    Object.keys(want).forEach((key) =>
      collectMismatches(want[key], have[key], `${path}.${key}`, mismatches),
    );
    return;
  }

  if (want !== have) {
    mismatches.push(
      `${path}: want ${JSON.stringify(want)}, live ${JSON.stringify(have)}`,
    );
  }
}

/**
 * Compare rules by `type` rather than by array position. GitHub is not
 * documented to preserve the order rules were submitted in, and a reordering
 * that changed nothing about enforcement would otherwise read as drift.
 */
function collectRuleMismatches(want, have, mismatches) {
  const liveByType = new Map((have ?? []).map((rule) => [rule.type, rule]));

  for (const rule of want) {
    const live = liveByType.get(rule.type);
    if (!live) {
      mismatches.push(`rules.${rule.type}: missing from the live ruleset`);
      continue;
    }
    collectMismatches(rule, live, `rules.${rule.type}`, mismatches);
  }
}

export function compare(desired, live) {
  const mismatches = [];

  for (const key of MANAGED) {
    if (!(key in desired)) continue;
    if (key === 'rules') {
      collectRuleMismatches(desired.rules, live.rules, mismatches);
    } else {
      collectMismatches(desired[key], live[key], key, mismatches);
    }
  }

  // Every path that decides something differs records it, so "ok" is exactly
  // "nothing to report" — a separately tracked success flag could only ever
  // drift from the list the caller prints.
  return { ok: mismatches.length === 0, mismatches };
}
