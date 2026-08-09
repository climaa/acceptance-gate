# TASK

Fix issue {{TASK_ID}}: {{ISSUE_TITLE}}

Pull in the issue using `gh issue view <ID>`. If it has a parent PRD, pull that in too.

Only work on the issue specified.

Work on branch {{BRANCH}}. Make commits and run tests.

## FAST-PATH: ALREADY DONE?

Before doing anything else, check whether this branch already has commits ahead of `main`:

!`git rev-list --count origin/main..HEAD`

If the number is **0**, the branch has no work yet — proceed with the rest of this prompt.

If the number is **greater than 0**, perform two relevance checks before declaring completion:

**Check A — Correct base branch**: Run both commands and compare their output:

```bash
git merge-base HEAD origin/main
git rev-parse origin/main
```

If the two SHAs are **different**, this branch was forked from the wrong base (not from current `origin/main`). **STOP**: leave a comment on the issue and exit:

```bash
gh issue comment {{TASK_ID}} --body "Branch {{BRANCH}} was forked from the wrong base (not origin/main). Manual intervention required."
```

Then output `<promise>COMPLETE</promise>` and exit.

**Check B — Commit relevance**: Run:

```bash
git log main..HEAD --oneline
```

Check whether any commit message references `#{{TASK_ID}}` or contains a keyword from the title `{{ISSUE_TITLE}}` (case-insensitive, partial word match is fine). If **none** of the commits appear related to this issue, the existing commits are unrelated work — treat as "no relevant work yet" and **proceed** with implementation.

If **both checks pass** (merge-base matches origin/main HEAD, and at least one commit appears related to this issue), the implementation already landed on this branch in a prior run. **Do not re-explore, re-implement, or re-test.** Skip every section below and immediately output `<promise>COMPLETE</promise>`. The merge phase will land the existing commits.

## CONTEXT

Here are the last 10 commits:

<recent-commits>

!`git log -n 10 --format="%H%n%ad%n%B---" --date=short`

</recent-commits>

## EXPLORATION

Explore the repo and fill your context window with relevant information that will allow you to complete the task.

Pay extra attention to test files that touch the relevant parts of the code.

## EXECUTION

If applicable, use RGR to complete the task.

1. RED: write one test
2. GREEN: write the implementation to pass that test
3. REPEAT until done
4. REFACTOR the code

## RENAME SWEEP

If your implementation renamed a symbol, file path, config key, environment variable, npm script, or any other identifier referenced by string, run a grep sweep before considering the task complete:

```bash
# For each renamed identifier:
grep -rn --include="*.ts" --include="*.tsx" --include="*.mts" --include="*.mjs" \
         --include="*.js" --include="*.jsx" --include="*.json" --include="*.yaml" \
         --include="*.yml" --include="*.md" \
         "<OLD_NAME>" . | grep -v node_modules | grep -v "\.next" | grep -v dist
```

For each hit:

- If it's the new file you just edited (the rename itself), ignore.
- If it's a comment that documents the old name as historical context, leave it — but add a `(renamed YYYY-MM-DD to <NEW_NAME>)` annotation if the comment was load-bearing.
- If it's any other production reference — code, test guard, config, docs, package.json script — update it. This is the most common source of "PR looked complete, CI went red on a value-guard or config-driven test."

If you made any updates as a result of the sweep, re-run the workspace-scoped checks before committing.

Skip this sub-step entirely if your implementation did not rename anything (additions-only PRs, bug fixes that touch behavior but not names).

## FEEDBACK LOOPS

Before committing, derive the affected workspaces from your diff:

```bash
git diff --name-only origin/main...HEAD | \
  awk -F/ '/^apps|^packages/ {print "./"$1"/"$2}' | sort -u
```

For each workspace listed, run its scoped checks first (fast — usually <30s):

```bash
pnpm --filter <workspace-path> typecheck
pnpm --filter <workspace-path> test
```

Only if your diff touches >2 workspaces OR root config files (root package.json, turbo.json, pnpm-workspace.yaml), fall back to root scripts:

```bash
pnpm run typecheck
pnpm run test
```

Root scripts traverse the full monorepo and take minutes. Avoid them when a filter would do.

## COMMIT

Never pass `--no-verify` to `git commit` or `git push`. If a hook fails, fix it or stop — do not bypass.

Make a git commit. The commit message must:

1. Use Conventional Commits format: `<type>(<scope>): <summary>` (e.g. `fix(pwa/comm2): drop placeholder fallback`)
2. Include task completed + PRD reference in body
3. Key decisions made
4. Files changed
5. Blockers or notes for next iteration

Keep it concise.

## PUSH

After all commits, push the branch immediately so work is preserved if this session is interrupted before the completion token is emitted:

```bash
git push -u origin HEAD
```

If the push fails, log the error and continue — the merge phase will retry.

## THE ISSUE

If the task is not complete, leave a comment on the issue with what was done.

Do not close the issue - this will be done later.

Once complete, output `<promise>COMPLETE</promise>` on its own line as your **very last characters**. Do not write a summary, explanation, or any other text after the token.

## FINAL RULES

**`.feature` files are product requirements — never edit one to make a test pass.**
If a scenario seems wrong, say so in the issue/PR and stop; the diff must not touch
`features/`. Respect the issue's do-not-touch list.

ONLY WORK ON A SINGLE TASK.

**Do not use `run_in_background: true` for any bash call.** Poll with foreground loops (`while sleep 30; do …; done`) so this process holds no open background handles when you emit `<promise>COMPLETE</promise>`. Sandcastle's completion-signal detector misses the signal if background tasks are pending.

**`<promise>COMPLETE</promise>` must be your very last output.** Do not write a summary, explanation, or any text after the token. The completion-signal detector reads raw output; trailing prose masks the signal and causes idle-timeout work loss.
