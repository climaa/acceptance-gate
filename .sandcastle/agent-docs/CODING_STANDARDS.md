# Coding Standards

The reviewer agent loads this during review. Keep it short, opinionated, and
project-specific — not a generic style guide. It grows only from repeated review
findings, never from ambition.

## Stack & versions

- pnpm **11.20.0** (pinned via `packageManager` + sha512), Node **22** (`.nvmrc`)
- Turborepo monorepo: `apps/{blog}`, `packages/{ui,tsconfig}` — Storybook, e2e and
  `packages/visual-diff` arrive by issue
- TypeScript strict; ESLint runs today only in `apps/blog` (via `eslint .` on
  ESLint 9 flat config, no `--max-warnings=0`) — treat warnings as errors, and
  keep doing so as the other workspaces gain lint
- **`pnpm format:check`** — Prettier over `**/*.{ts,mts,tsx,md,mdx,json,css}`.
  Docs and Markdown count. `pnpm format` fixes.
- **`pnpm health:check`** — cognitive-complexity ceiling of **20** per function
  (`scripts/complexity-gate.mjs`, fallow under the hood). Cognitive, not
  cyclomatic, on purpose: a flat sequence of guard-returns is fine, nesting is
  what scores. A diff that trips it fails CI — extract a helper (see #63-#65).
- Everything public is **English** — code, comments, docs, commit messages

## Workspace conventions

- Internal packages export source directly (`exports` → `./src/*`). **No `dist/`
  build step** — `workspace:*` consumers transpile via `transpilePackages`.
- Don't add a `build` script to a workspace just because turbo's `^build` hint says
  to. Verify `exports`/existing scripts first.
- **No component hardcodes a visual value.** Everything resolves through a custom
  property in `packages/ui/src/tokens.css`; dark mode remaps semantic roles only.
- **Theme switching is `[data-theme="dark"]` on `<html>` — never
  `prefers-color-scheme`.** Storybook's decorator and the visual-diff capture URL
  will both set `data-theme` once those tools arrive; a media-query theme would
  leave both blind to dark mode.
- **Fonts are self-hosted woff2 in `packages/ui/src/fonts/` only.** Never introduce
  `system-ui`/`-apple-system` as a leading family (`src/fonts/og/` TTF is the one
  documented exemption). No `packages/ui` component animates on mount.

## Testing

- **AAA**: every unit test reads Arrange → Act → Assert, blank-line separated, one
  act per test. Gherkin scenarios are the same shape (Given=Arrange, When=Act,
  Then=Assert) — a scenario with two When/Then cycles is the same smell as a test
  with two acts.
- **Testing pyramid**: assert at the lowest layer that can catch the failure.
  Adding an e2e scenario where a unit test suffices is a review finding.
- **A bug fix lands with the regression test that fails without it.**
- **A happy-path-only test suite is a review finding** — name the edge case and the
  error path.
- Don't test the trivial or the generated (getters, config echoes, codegen).
  Coverage is a floor on business logic, never a target.
- Don't disable, skip, or comment out failing tests to make a build pass. Diagnose
  root cause. A skip requires a `reason` comment and must surface in the report.

## `.feature` files

- **`.feature` files describe product requirements and are not edited to make a
  test pass.** If a scenario fails and you believe the scenario is wrong, say so in
  the PR and wait for human review. The diff simply must not touch `features/`.

## Scope discipline

- **Strict file scoping:** if the issue says "fix X", edit X. No "while I'm here"
  cleanups — they belong in separate PRs.
- **YAGNI:** zero call sites = don't add it. **No partial features:** if you start,
  finish — no TODO stubs for core functionality.
- Respect every issue's do-not-touch list.

## Comments

- Default to **no comment**. Only add when WHY is non-obvious — a hidden
  constraint, a workaround, a subtle invariant. Never reference the current task.

## Don't

- Push directly to `main`. Always go through a PR.
- Use `git commit --no-verify`, `git commit -n`, `git push --no-verify`, or any
  hook-bypass flag. Hook failures are blockers — fix the cause or stop and report.
- Use `--no-gpg-sign` or other signing bypasses.
- Ignore CI failures with workarounds; diagnose root cause.
- Add a `pnpm-workspace.yaml` `overrides:` pin casually.

## When in doubt

- Check existing patterns in the same workspace before introducing a new one.
- Smaller diffs win.
