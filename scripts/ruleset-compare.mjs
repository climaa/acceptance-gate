// The pure half of scripts/apply-ruleset.mjs: given the ruleset a file declares
// and the one the API returned, what — if anything — differs?
//
// A module of its own because apply-ruleset.mjs shells out to `gh` at import
// time, so importing it to reach these functions would run the real thing. This
// file touches nothing outside its two arguments, which is what makes the
// comparison testable at all — and it is the half worth testing: a false
// positive here reports drift that is not there, which makes a scheduled drift
// check permanently red, and a check that is always red is a check nobody reads.

// The top-level fields this repo manages. Everything else the API returns (id,
// source_type, created_at, _links, current_user_can_bypass) is GitHub's, not
// ours, and is ignored.
const MANAGED = ['name', 'target', 'enforcement', 'bypass_actors', 'conditions', 'rules'];

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

export function compare(desired, live) {
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
