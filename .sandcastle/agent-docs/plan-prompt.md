# ISSUES

Here are the open issues in the repo:

<issues-json>

!`gh issue list --state open --author climaa --limit 1000 --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'`

</issues-json>

## ALREADY-IMPLEMENTED BRANCHES

Sandcastle branches that already have commits ahead of `main` — the
implementation is done and waiting for the merge phase. **Skip these
issues**; picking them again wastes an iteration on idempotent work and
the orchestrator merges them on its own.

<implemented-branches>

!`git for-each-ref --format='%(refname:short)' refs/heads/sandcastle/ | while read b; do n=$(git rev-list --count "origin/main..$b" 2>/dev/null || echo 0); if [ "$n" -gt 0 ]; then echo "$b ($n commit(s) ahead)"; fi; done; true`

</implemented-branches>

## ALREADY-ATTEMPTED ISSUES

An issue labelled `sandcastle:no-op` was already run and produced no changes —
either the work was already done, or the task was not understood. It is waiting
on a human, not on another attempt. **Exclude it from the plan.** A comment on
the issue explains what happened; a human removes the label when it is worth
running again.

## HELD ISSUES

An issue labelled `sandcastle:hold` is not ready to be worked — it was filed
deliberately incomplete, or the approach is not decided yet. **Exclude it from the
plan.** Unlike `sandcastle:no-op`, this is not the record of a prior run that
produced nothing; it is a deliberate pause, and it holds until a human removes the
label.

## STORIES NEED A TILE

A story in `packages/ui` ships with its tile on its tier board (`designs/STANDARD.md`),
and the gate's `boards` check fails without it. A tile is drawn in the Pencil app, which
no agent here can reach. So an issue whose work adds a Storybook story, or renames one,
is attended work unless its body says the tiles are already drawn (naming the PR or
commit that drew them). **Exclude such an issue from the plan**, and say why in its
entry's reasoning if you list it at all.

## SANDBOX CONSTRAINT

The planner is read-only: it only reads and reasons about issues. This sandbox
bind-mounts the host checkout, so **never run a bare `pnpm install`** or any other
mutating pnpm command — a full install rewrites the host's `node_modules` pnpm
state and forces a from-scratch reinstall of every workspace project.

## TASK

Analyze the open issues and build a dependency graph. For each issue, determine whether it **blocks** or **is blocked by** any other open issue.

**Before assigning a branch, also check the already-implemented list above.** If an issue's `sandcastle/issue-{id}-...` branch is in that list, exclude the issue from the plan — it is done and the merge phase will land it.

An issue B is **blocked by** issue A if:

- B requires code or infrastructure that A introduces
- B and A modify overlapping files or modules, making concurrent work likely to produce merge conflicts
- B's requirements depend on a decision or API shape that A will establish

An issue is **unblocked** if it has zero blocking dependencies on other open issues.

For each unblocked issue, assign a branch name using the format `sandcastle/issue-{id}-{slug}`.

## OUTPUT

Output your plan as a JSON object wrapped in `<plan>` tags:

<plan>
{"issues": [{"id": "42", "title": "Fix auth bug", "branch": "sandcastle/issue-42-fix-auth-bug"}]}
</plan>

Include only unblocked issues. If every issue is blocked, include the single highest-priority candidate (the one with the fewest or weakest dependencies).
