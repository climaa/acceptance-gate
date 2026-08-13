# Rulesets as code

`main.json` is the branch ruleset protecting the default branch. JSON has no comments, so
the reasoning lives here — the file is the artifact, this is the argument for it.

Apply it with `node scripts/apply-ruleset.mjs` (prints the diff; `--apply` writes).

## Why this exists at all

Every other rule in this repo is committed and explained: the gate is `pr.yml`, the
complexity ceiling is `scripts/complexity-gate.mjs`, the tag vocabulary is
`apps/e2e/README.md`. Branch protection was the exception — it lived only in the web UI,
where nothing records why it is the way it is, a change leaves no diff, and reconstructing
it after an accident means remembering. That is the gap this closes. The ruleset is still
enforced by GitHub, not by this file; what the file buys is review, history, and a written
rationale.

## What each rule is for

**`required_status_checks` → `gate`, and only `gate`.** This is the load-bearing decision
and it is deliberate, not an omission. `pr.yml` runs `checks` (six matrix legs),
`sandcastle`, `e2e` and `visual-diff`, but only `gate` is required here, because `gate`
aggregates the first three through its `needs:` and fails unless every one reports exactly
`success`. Adding a job to `gate.needs` therefore tightens the merge bar with no settings
change — which is the promise `pr.yml`'s header makes, and the reason wiring `e2e` in
(#227) needed no edit here.

**Never add a second context.** A required context that never reports blocks every PR
forever, and the failure looks like a hung check rather than a misconfiguration. If a new
job should block merges, it goes in `gate.needs`, not in this file.

**`strict_required_status_checks_policy: true`** — branches must be up to date with `main`
before merging. Known cost, accepted: GitHub's auto-merge waits for checks but never
updates a stale branch, so every open PR flips to `BEHIND` the moment a sibling merges.
Sandcastle handles this itself by updating `BEHIND` PRs; anything outside that pipeline
needs `gh pr update-branch`.

**`required_review_thread_resolution: true`** — the one genuinely new rule versus the
classic protection this replaces. An unresolved review thread now blocks the merge.
Verified safe against the pipeline before enabling: nothing in `.sandcastle/` calls
`gh pr review` or `POST /pulls/*/reviews`, and `visual-diff` posts an _issue_ comment,
which is not a resolvable thread. Only a human (or `/code-review --comment`) creates one.

**`required_approving_review_count: 0`** — a PR is required, approvals are not. Requiring
an approval would deadlock the pipeline outright: Sandcastle opens and merges its own PRs
with no second account to approve them.

**`allowed_merge_methods: ["squash"]`** — matches what actually merges here. Both
`gh pr merge --squash` in `dependabot-auto-merge.yml` and Sandcastle's merger use squash,
so this forbids nothing that happens today and keeps history linear without needing
`required_linear_history`.

**`deletion` + `non_fast_forward`** — `main` cannot be deleted or force-pushed. Straight
carry-over from the classic protection.

**`bypass_actors: []`** — nobody bypasses, which is the ruleset equivalent of classic
protection's `enforce_admins: true`. `dependabot-auto-merge.yml` merges on a PAT precisely
so the push-to-main run fires; that PAT is an admin token and still cannot merge a red PR,
which is the property this empty list preserves.

## Behavior change to know about

The `pull_request` rule means **direct pushes to `main` are now rejected**, including your
own. Classic protection here did not require a PR — it only required `gate` to have passed
on whatever was being pushed. Everything already goes through PRs (Sandcastle, Dependabot,
hand-authored fixes), so this matches practice rather than changing it, but a
`git push origin main` that used to work will now be refused. Open a PR instead.

## This ruleset does not replace the classic protection

Both are live, and GitHub evaluates them together — the most restrictive wins, so running
both is safe and is the intended migration path. Do not delete the classic protection in
the same change that adds this: verify the ruleset is doing the work first (open a throwaway
PR, confirm it blocks on a red `gate`), and remove the classic rule as a separate,
reversible step. Removing both at once is how a repo ends up briefly unprotected.

Because both are active, a rule present in one and absent from the other still applies.
`required_review_thread_resolution` is enforced by this ruleset alone; the classic rule has
no equivalent and does not need one.

## Editing

Change `main.json`, open a PR, then run `node scripts/apply-ruleset.mjs --apply` once it
merges. The script matches the live ruleset by `name`, so renaming `main` creates a second
ruleset rather than updating the first — rename in the UI, or delete and re-apply.
