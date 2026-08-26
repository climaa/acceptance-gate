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
- **Theme rendering is `[data-theme="dark"]` on `<html>` — never a live
  `prefers-color-scheme` mechanism.** Storybook's decorator and the visual-diff
  capture URL both set `data-theme` explicitly; a media-query theme would leave
  both blind to dark mode, since a capture pipeline needs a theme it chose, never
  one the capture machine's OS happened to be set to — that rule is absolute
  there. The blog's pre-hydration script (`apps/blog/lib/theme.ts`) is the one
  documented exception: it may consult `prefers-color-scheme` exactly once, as a
  first-visit default when no explicit stored choice exists yet, and only
  because the result still funnels into the same `[data-theme]` attribute the
  toggle writes — an explicit stored choice always wins over it, in either
  direction, so there is still exactly one theme mechanism, not two competing
  ones.
- **Fonts are self-hosted woff2 in `packages/ui/src/fonts/` only.** Never introduce
  `system-ui`/`-apple-system` as a leading family (`src/fonts/og/` TTF is the one
  documented exemption). No `packages/ui` component animates on mount —
  Skeleton's shimmer and Spinner's ring are the two sanctioned exceptions, and
  each argues for itself in its own sheet.

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
- **Never unit-test how CSS looks.** Rendered appearance belongs to
  `packages/visual-diff`; that is the entire reason it exists. A test that parses a
  stylesheet to assert a colour, a size or a contrast ratio is a proxy for the
  render and will drift from it.
  - **Appearance** → visual-diff baselines.
  - **Rendered accessibility** → axe, on real DOM (`addon-a11y` in Storybook, the
    Playwright a11y scenario). Note visual-diff catches _change_, not
    _correctness_: a control that fails WCAG AA is baselined green and stays green
    forever, so contrast is axe's, never the differ's and never a token-pair
    test's. The contrast blocks in `packages/ui/src/__tests__/tokens.test.ts` are
    the interim exception until that scenario lands — marked provisional there,
    and deleted with it.
  - **Structural CSS rules are the exception and stay unit-tested**, because
    pixels cannot see them: no `--c-` reference outside `tokens.css`, every raw
    token consumed by a semantic role, no literal colours in any rule sheet,
    every role remapped under `[data-theme="dark"]`, the woff2 / no-`system-ui`
    font ban, and `styles.css` staying a manifest of per-component sheets. These
    are architecture and determinism guards — a component reading a raw token
    renders identically today and breaks theming later.

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
- **Widening a formatter's or linter's scope lands the mechanical reformat as its
  own commit, ahead of the change that widened it.** Adding a glob or a check
  pulls previously-unchecked files into scope, and if that reflow rides inside
  the commit that also does the real work, a reviewer can't tell "the tool did
  this" from "a human decided this" without re-running the tool. Worked example:
  #370 widened `format:check`'s glob to include `mjs,cjs,js`; the resulting
  reflow of `scripts/apply-ruleset.mjs` and others landed inside the same commit
  that turned on `typecheck` for `packages/visual-diff` (#372).

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
