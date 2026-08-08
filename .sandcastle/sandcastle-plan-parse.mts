// Validation gate for the planning agent's <plan> JSON.
//
// This is the trust boundary between agent-authored output and the host shell.
// The planner reads the open-issue list (titles, bodies, labels — all
// attacker-influenceable on a public repo) and emits a <plan> block. Its `id`
// and `branch` fields then flow into host `execSync`/`gh` calls in
// sandcastle-git.mts and main.mts. Before this module, those fields were spent
// straight out of `JSON.parse` with no validation, so a planned branch named
// `sandcastle/issue-1-$(...)` was working host-side command injection.
//
// parsePlan is the only sanctioned construction site for planner-derived
// IssueRefs. It accepts only the documented grammar (sandcastle-git-parse.mts)
// and rejects the WHOLE plan on any violation — a plan is one trust unit;
// per-issue skipping would let a malformed planner degrade the run silently.
// This mirrors the all-or-nothing throw the model-override labels already use
// (main.mts). It constructs fresh objects from validated fields only, so any
// extra key the planner smuggles in (e.g. a forged `overrides`) is dropped.
//
// Imports nothing that runs at load: the grammar from sandcastle-git-parse.mts
// (side-effect-free) at runtime, and the IssueRef *type* from sandcastle-git.mts
// (erased at compile time — no runtime coupling to that module's git IO).
import {
  ISSUE_ID_RE,
  SANDCASTLE_BRANCH_RE,
  parseIssueIdFromBranch,
} from './sandcastle-git-parse.mts';
import type { IssueRef } from './sandcastle-git.mts';

// Validate ONE raw plan entry against the id/branch grammar and the
// duplicate-id / duplicate-branch guards. Returns a fresh IssueRef built from
// the validated fields only (dropping any extra planner keys), or an error
// string naming the offender. On success it records the id/branch in the seen
// sets, so the caller's loop stays a flat dispatch. A sequence of guard-returns
// with no nesting — the per-entry rules read top to bottom.
function validateEntry(
  entry: unknown,
  at: string,
  seenIds: Set<string>,
  seenBranches: Set<string>,
): { issue: IssueRef } | { error: string } {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return { error: `${at}: not an object` };
  }
  const { id, title, branch } = entry as Record<string, unknown>;

  if (typeof id !== 'string' || !ISSUE_ID_RE.test(id)) {
    return { error: `${at}: invalid id ${JSON.stringify(id)} (expected digits)` };
  }
  if (typeof title !== 'string' || title.length === 0) {
    return { error: `${at} (#${id}): missing or empty title` };
  }
  if (typeof branch !== 'string' || !SANDCASTLE_BRANCH_RE.test(branch)) {
    return {
      error:
        `${at} (#${id}): invalid branch ${JSON.stringify(branch)} ` +
        `(expected sandcastle/issue-${id}-<slug>, slug [a-z0-9-])`,
    };
  }
  // Grammar guarantees a digit id inside the branch; assert it is THIS id so a
  // plan cannot pair id 42 with someone else's branch.
  if (parseIssueIdFromBranch(branch) !== id) {
    return {
      error: `${at} (#${id}): branch ${JSON.stringify(branch)} does not embed id ${id}`,
    };
  }
  if (seenIds.has(id)) return { error: `${at} (#${id}): duplicate id` };
  if (seenBranches.has(branch)) {
    return { error: `${at}: duplicate branch ${branch}` };
  }

  seenIds.add(id);
  seenBranches.add(branch);
  return { issue: { id, title, branch } };
}

/**
 * Parse and validate the raw string inside a <plan>…</plan> block into a
 * list of IssueRefs safe to interpolate into host commands. Throws — listing
 * every offending entry — if the JSON is malformed or any entry violates the
 * id/branch grammar; returns a fresh array of `{ id, title, branch }` on success.
 */
export function parsePlan(raw: string): IssueRef[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`<plan> JSON did not parse: ${(err as Error).message}\n\n${raw}`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('<plan> JSON must be an object with an `issues` array.');
  }
  const issuesRaw = (parsed as { issues?: unknown }).issues;
  if (!Array.isArray(issuesRaw)) {
    throw new Error('<plan> JSON `issues` must be an array.');
  }

  const errors: string[] = [];
  const issues: IssueRef[] = [];
  const seenIds = new Set<string>();
  const seenBranches = new Set<string>();

  for (let i = 0; i < issuesRaw.length; i++) {
    const result = validateEntry(issuesRaw[i], `issues[${i}]`, seenIds, seenBranches);
    if ('error' in result) {
      errors.push(result.error);
    } else {
      issues.push(result.issue);
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Invalid <plan> JSON — rejecting the whole plan:\n${errors
        .map((e) => `  ${e}`)
        .join('\n')}`,
    );
  }

  return issues;
}
