# Rulesets as code

`main.json` is the branch ruleset for the default branch. JSON has no comments, so the
reasoning lives here — the file is the artifact, this is the argument for it.

```bash
node scripts/apply-ruleset.mjs            # prints what differs, exits 1 on drift
node scripts/apply-ruleset.mjs --apply    # writes; needs admin:repo
```

## Status: committed, not applied

**Nothing in this directory is in force until someone runs `--apply`.** Merging a change
here changes no behaviour whatsoever. Everything below is written in the conditional for
that reason — these are the rules the file _declares_, not a description of the
repository's current state.

To find out which it is, run the script: it prints the mismatches or says the live ruleset
satisfies everything this file declares. Do not infer it from the presence of this file.

That gap is the known weakness of the approach. A committed file that nothing enforces can
be wrong indefinitely, which is the opposite of how every other rule in this repo works —
`pr.yml` is committed _and_ GitHub runs it, `scripts/complexity-gate.mjs` is committed
_and_ the `health` leg executes it. Closing it needs a read-only drift check on a schedule;
that is tracked separately and deliberately not bundled here.

## Why this exists at all

Every other rule in this repo is committed and explained: the gate is `pr.yml`, the
complexity ceiling is `scripts/complexity-gate.mjs`, the tag vocabulary is
`apps/e2e/README.md`. Branch protection was the exception — it lived only in the web UI,
where nothing records why it is the way it is, a change leaves no diff, and reconstructing
it after an accident means remembering.

Be honest about the size of the operational problem: one maintainer, settings that change
rarely, and recovery from a bad edit is a few minutes of clicking. The stronger reason is
that a repo whose entire subject is acceptance gates cannot leave the thing that makes
`gate` binding undocumented. Without branch protection, `pr.yml` is advisory.

### What belongs in this directory, and what does not

**Commit the settings the gate depends on for its meaning. Do not commit settings that are
merely settings.** Required contexts, bypass actors, force-push and deletion rules: in.
Labels, topics, repository description, wiki flags, merge-button defaults unrelated to
enforcement: out. Without that line this becomes general-purpose config management, which
is a different project.

## What each rule is for

**`required_status_checks` → `gate`, and only `gate`.** This is the load-bearing decision
and it is deliberate, not an omission. `pr.yml` runs `checks` (six matrix legs),
`sandcastle`, `e2e` and `visual-diff`, but only `gate` is required, because `gate`
aggregates the first three through its `needs:` and fails unless every one reports exactly
`success`. Adding a job to `gate.needs` therefore tightens the merge bar with no settings
change — which is the promise `pr.yml`'s header makes.

**Never add a second context.** A required context that never reports blocks every PR
forever, and it presents as a hung check rather than a misconfiguration. If a new job
should block merges, it goes in `gate.needs`, not in this file.

**`strict_required_status_checks_policy: true`** — branches must be up to date with `main`
before merging. Known cost, accepted: GitHub's auto-merge waits for checks but never
updates a stale branch, so every open PR flips to `BEHIND` the moment a sibling merges.
Sandcastle handles this itself by updating `BEHIND` PRs; anything outside that pipeline
needs `gh pr update-branch`.

**`required_review_thread_resolution: true`** — an unresolved review thread would block the
merge. Classic protection has no equivalent. Checked against the pipeline before declaring
it: nothing in `.sandcastle/` calls `gh pr review` or `POST /pulls/*/reviews`, and
`visual-diff` posts an _issue_ comment via `github.rest.issues.createComment`, which is not
a resolvable thread. Only a human — or `/code-review --comment` — creates one.

**`required_approving_review_count: 0`** — a PR is required, approvals are not. Requiring
an approval would deadlock the pipeline outright: Sandcastle opens and merges its own PRs
with no second account to approve them.

**`allowed_merge_methods: ["squash"]`** — matches what the automation does. Both
`gh pr merge --squash` in `dependabot-auto-merge.yml` and Sandcastle's merger use squash,
and it keeps history linear without needing `required_linear_history`. It is **not** a
no-op for humans — see below.

**`deletion` + `non_fast_forward`** — `main` could not be deleted or force-pushed. Straight
carry-over from the classic protection.

**`bypass_actors: []`** — nobody bypasses. Rulesets have no `enforce_admins` equivalent
because non-bypass _is_ the default; bypass is opt-in per actor. A fine-grained PAT acts as
its user, so the Dependabot PAT gets no bypass either — which is the property that keeps
`--auto` from ever merging a red PR.

If you ever add an actor here, note that `bypass_mode: exempt` (added September 2025) skips
the rules **and writes no audit entry**. Prefer `always`, which is auditable.

**No `update` rule, on purpose.** "Restrict updates" is documented as a push restriction,
but there are multiple independent reports of it blocking PR merges as well, including for
admins. Its absence here is a decision, not an oversight.

## Behaviour changes if this is applied

Three, not one. The first two are intended; the third is easy to miss.

1. **Direct pushes to `main` are rejected**, including yours. Classic protection here never
   required a PR. Everything already goes through PRs, so this matches practice — but a
   `git push origin main` that used to work would stop.
2. **An unresolved review thread blocks the merge**, per above.
3. **Humans lose "Create a merge commit" and "Rebase and merge."** The repository currently
   has `allow_merge_commit` and `allow_rebase_merge` enabled, so those buttons work in the
   UI today. `allowed_merge_methods: ["squash"]` removes them. The automation is unaffected
   — it already squashes — so this is a change for people, not for the pipeline.

Verified as _not_ a behaviour change: the `pull_request` rule does not break Sandcastle or
Dependabot. It restricts pushes, and a merge performed through a PR is the mechanism it
exists to permit; `non_fast_forward` does not block squash merges. Sandcastle pushes
feature branches and merges with `gh pr merge --squash --auto`, never to `main` directly.

## Break-glass

Write this down while calm rather than during the incident.

`bypass_actors: []` plus a required PR means that **if `gate` itself breaks, the fix must
go through a PR that must pass the broken gate.** Classic protection with
`enforce_admins: true` has the same property today, so this is not new — but it becomes
committed and load-bearing.

The recovery path is a UI action, by design: Settings → Rules → the `main` ruleset → set
enforcement to **Disabled**, land the fix, set it back to **Active**. Expect a two-minute
window. It is deliberately not scriptable from CI, for the same reason `--apply` is not:
anything that can turn the protection off from inside the pipeline defeats it.

`enforcement: "evaluate"` — which would let rules report without enforcing, and would be
the obvious way to stage a migration — is **Enterprise-only** and unavailable on this plan.
The throwaway-PR verification in the migration notes is the substitute, not laziness.

## This ruleset does not replace the classic protection

Both would be live, and GitHub evaluates them together: _"all applicable rules are
enforced"_, and where the same rule is defined differently, the most restrictive version
applies. Running both is safe and is the intended migration path.

Two caveats worth having in writing.

**The edit cost is asymmetric.** Tightening takes one edit and binds immediately.
_Loosening takes two, and the first one is a silent no-op_ — remove `strict` from
`main.json`, apply it, and nothing changes, because classic protection still requires
up-to-date branches. No error, no signal, and a plausible wrong conclusion ("rulesets don't
work here"). While both are live, this file is a **subset** of the protection posture, not
the posture itself.

**The layering of required status checks specifically is undocumented.** GitHub documents
that rulesets and branch protection aggregate, but not how required-check contexts union,
nor how `strict` behaves when only one side sets it. It happens not to matter here because
both sides are `gate` with `strict: true` — that is a coincidence, not a guarantee, and it
stops being true the moment the two configs diverge. Which is mid-migration, i.e. exactly
when you would want to rely on it.

So: do not leave the migration half-done. Apply, verify on a throwaway PR that `gate` reds,
remove the classic rule, confirm
`gh api repos/climaa/acceptance-gate/branches/main/protection` 404s.

## Editing

Change `main.json`, open a PR, then run `node scripts/apply-ruleset.mjs --apply` once it
merges. The script matches the live ruleset by `name`, so renaming `main` creates a second
ruleset rather than updating the first — rename in the UI, or delete and re-apply.

The drift check is a **subset** comparison: it asserts that everything `main.json` declares
is true of the live ruleset, and ignores keys the file says nothing about. It has to be,
because GitHub materialises parameter defaults that were never declared. The consequence is
worth knowing: a rule someone adds in the web UI that this file does not mention will not
be reported as drift.
