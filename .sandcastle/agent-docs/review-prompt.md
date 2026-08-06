# TASK

Review the code changes on branch `{{BRANCH}}` (issue #{{TASK_ID}}: {{ISSUE_TITLE}}) and improve code clarity, consistency, and maintainability while preserving exact functionality.

**Do not use `run_in_background: true` for any bash call.** Poll with foreground loops (`while sleep 30; do …; done`) so this process holds no open background handles when you emit `<promise>COMPLETE</promise>`. Sandcastle's completion-signal detector misses the signal if background tasks are pending.

## SCOPE GUARD — Run this before anything else

```bash
git diff origin/main...HEAD --name-only
```

Check whether any of the listed files plausibly relate to issue #{{TASK_ID}} ("{{ISSUE_TITLE}}"). Use your judgment: file names in the right module, matching the issue's scope or keywords.

- **If the diff is empty or no files appear relevant** to this issue's scope: **STOP**. Do not make any edits. Leave a comment on the issue:

  ```bash
  gh issue comment {{TASK_ID}} --body "Reviewer: implementer did not produce relevant work — branch contents do not match issue scope (#{{TASK_ID}}: {{ISSUE_TITLE}}). Manual intervention required."
  ```

  Then output `<promise>COMPLETE</promise>` and exit.

- **If relevant files exist**: proceed with the review below. **Constrain all edits to files that appear in the diff above** — do not edit files the implementer did not touch.

## CONTEXT

## Branch diff

!`git diff origin/main...HEAD`

## Commits on this branch

!`git log origin/main..HEAD --oneline`

## REVIEW PROCESS

Load `agent-docs/CODING_STANDARDS.md` and review against it — especially the
testing conventions (AAA, pyramid, regression-test-with-bugfix, no
happy-path-only suites) and the `.feature`-files rule: a diff that edits
`features/` to make a test pass is an automatic revision request.

1. **Understand the change**: Read the diff and commits above to understand the intent.

2. **Analyze for improvements**: Look for opportunities to:
   - Reduce unnecessary complexity and nesting
   - Eliminate redundant code and abstractions
   - Improve readability through clear variable and function names
   - Consolidate related logic
   - Remove unnecessary comments that describe obvious code
   - Avoid nested ternary operators - prefer switch statements or if/else chains
   - Choose clarity over brevity - explicit code is often better than overly compact code

3. **Check correctness**:
   - Does the implementation match the intent? Are edge cases handled?
   - Are new/changed behaviors covered by tests?
   - Are there unsafe casts, `any` types, or unchecked assumptions?
   - Does the change introduce injection vulnerabilities, credential leaks, or other security issues?
   - **Verify output shape, not just exit code.** If the change touches how a tool, script, or build is invoked (script paths, CLI flags, config locations, file relocations, monorepo wiring), **run the affected command and inspect its actual output** — stdout, generated files, reported paths, finding counts. Many tools exit 0 with empty, truncated, or mangled output; an exit-code-only check can hide a silent regression. Compare to a concrete baseline: the issue's acceptance criteria, a sample from the prior invocation, or spot-check ≥3 entries by name. Treat exit code 0 as necessary but not sufficient. Do not assume CI's pass implies the tool works — CI only exercises the workflows that actually invoke it.

4. **Maintain balance**: Avoid over-simplification that could:
   - Reduce code clarity or maintainability
   - Create overly clever solutions that are hard to understand
   - Combine too many concerns into single functions or components
   - Remove helpful abstractions that improve code organization
   - Make the code harder to debug or extend
   - **Undo a documented workaround.** If the implementer's commit message explicitly explains why a denser/uglier form was chosen ("I tried X but it produced Y"), do not replace it with the "obvious" simpler form without first reproducing the original failure on the simpler form. Readability is not worth reintroducing a known bug.

5. **Apply project standards**: Follow the coding standards defined in @.sandcastle/agent-docs/CODING_STANDARDS.md

6. **Preserve functionality**: Never change what the code does - only how it does it. All original features, outputs, and behaviors must remain intact.

## EXECUTION

If you find improvements to make:

1. Make the changes directly on this branch
2. Run tests and type checking to ensure nothing is broken
3. Commit describing the refinements
4. After your refactor commit, re-run the same scoped typecheck/test commands the implementer used (derive workspaces from `git diff --name-only origin/main...HEAD`). If they fail:

   a. Run `git reset --hard HEAD~1` to drop your refactor commit.
   b. Leave a comment on the issue explaining what you tried and why it regressed:

   ```bash
   gh issue comment {{TASK_ID}} --body "Reviewer: refactor X reverted because it broke <test name>: <error tail>. Original implementer code preserved."
   ```

   c. Emit `<promise>COMPLETE</promise>` and exit.

   Never push a refactor that breaks a check the implementer's commit passed. The implementer's working version is the contract.

If the code is already clean and well-structured, do nothing.

Once complete, output `<promise>COMPLETE</promise>` on its own line as your **very last characters**. Do not write a summary, explanation, or any text after the token.
