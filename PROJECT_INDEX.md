# Project Index: acceptance-gate

Version 1.3.0 · generated 2026-08-31 (regenerate with `/sc:index-repo` — a stale date here
means the index needs a refresh)

## 📁 Project Structure

```
.sandcastle/           the autonomous orchestrator (public, self-tested)
  main.mts             serial issue loop: plan → implement → review → merge
  sandcastle-*.mts     27 modules: config · agent profiles · model overrides · lifecycle ·
                       merge · merge branch-line · run-issue · stranded-branches ·
                       worktree safety · worktree sandbox · build-verify · git ·
                       git-parse · git-probe · guard-phase · image freshness ·
                       issue-pipeline · issue-ref · no-op issues · plan-eligibility ·
                       plan-parse · pr-queue (+ gh) · sandbox hooks · turbo cache ·
                       variables · orchestrator
  agent-docs/          the four phase prompts + CODING_STANDARDS.md
  __tests__/           39 hermetic vitest files (654 tests) guarding the contracts
apps/
  blog/                Next.js 16 App Router + MDX (English) — index, post, tag, about,
                       RSS, sitemap, OG images; Cache Components + Partial Prefetching on;
                       web analytics on the production deployment only; Bugsink error
                       reporting live in both realms on the production deployment,
                       inert anywhere the DSN is unset
  storybook/           Storybook 10 + nextjs-vite — 26 stories, 19 docs pages
  e2e/                 playwright-bdd — 44 acceptance scenarios across the blog and
                       two seeded visual-diff worlds (:3200/:3201), plus a two-scenario
                       local lane that runs against your own tree
  visual-diff-ui/      Next.js 16 console over the differ — zod-validated read path,
                       locked job runner + guarded mutations, sample fixtures,
                       the dashboard's sets/reports/history tables, the run
                       panel with its live log, current job and accept gate,
                       the report's tier sections, review loop and a11y
                       treatment, the three-up viewer and comparison modal;
                       web analytics on the production deployment only; Bugsink error
                       reporting live in both realms on the production deployment,
                       inert anywhere the DSN is unset
  manual/              Next.js 16 — the console's end-user manual: three pages
                       (console, report, sample) parsed at build time from the
                       acceptance suite's own `.feature` files, so a scenario added
                       or deleted flows straight to the published page rather than
                       drifting from it; page views tracked on the same terms as
                       the blog and the console
packages/
  logger/              the shared error/warn/info logger: silent in production, and
                       `error()` always forwards to a reporter — with the Bugsink
                       adapter behind `@gate/logger/bugsink`, inert until a DSN exists
  ui/                  design system: tokens.css + 28 components in 4 tiers
                       (16 atoms · 6 molecules · 4 organisms · 2 templates); every
                       one storied but Stack, the layout primitive with nothing
                       of its own to capture
  visual-diff/         the self-built visual-regression CLI + 158 committed baselines
  tsconfig/            shared TS configs
designs/               acceptance-gate.pen (Pencil source) + exports/*.png
scripts/               complexity-gate.mjs (the health gate) · apply-ruleset.mjs
.claude/skills/        four committed Next.js agent skills (+ PROVENANCE.md)
.github/               pr.yml (the gate) · dependabot.yml · auto-merge · rulesets/ ·
                       CODEOWNERS · SECURITY.md · issue and PR templates
```

## 🚀 Entry Points

- Pipeline: `pnpm sandcastle` → `.sandcastle/main.mts` (dispatch: open issues by repo owner)
- Blog: `pnpm dev` → `apps/blog` on :3000
- Storybook: `pnpm --filter @gate/storybook dev` on :6006
- Visual-diff console: `pnpm --filter @gate/visual-diff-ui dev` on :3300 — points `VISUAL_DIFF_DATA_DIR` at a gitignored `.visual-diff/` at the repo root and seeds it, so a local console is live rather than in sample mode. `capture`/`run` build Storybook on the host, then run the differ inside the pinned container (`lib/docker.ts` + `scripts/capture-set.mjs`), so **Docker must be running** — the panel says so and disables the button when it is not. Jobs are refused off localhost (`lib/local.ts`, and again in `POST /api/jobs`); `next start` sets no variable, so an instance without one serves the committed sample data
- Acceptance suite: `pnpm turbo run e2e` (builds the blog and the visual-diff console first, seeds the three worlds, then runs the scenarios)
- Manual: `pnpm --filter @gate/manual dev` on :3400
- Visual diff: `pnpm visual-diff` / `pnpm visual-diff:accept`
- CI: `.github/workflows/pr.yml` → `gate` aggregator (only required check)
- Orchestrator tests: `pnpm test:sandcastle` → `vitest.sandcastle.config.mts`

## 📦 Core Modules

- **`.sandcastle/sandcastle-config.mts`** — constants: `BASE_BRANCH=main`, `gh` preflight, turbo credentials read from the repo-root `.env` only (never `process.env`), with the expected team derived from `.turbo/config.json` → mismatch or missing link disables the cache
- **`.sandcastle/sandcastle-model-overrides.mts`** — `sc:<role>:<model|effort:*>` label grammar; resolution `PROFILES < SC_* env < issue label`
- **`.sandcastle/sandcastle-merge.mts`** — squash auto-merge flow; ~20-min poll window
- **`.sandcastle/sandcastle-noop-issues.mts`** — a "nothing to do" outcome comments and stops; it deliberately never closes the issue, because that would hide a misread task
- **`packages/ui/src/tokens.css`** — the single visual source of truth; light = parchment/terracotta, dark = terminal lime; theme switch is `[data-theme]`, never `prefers-color-scheme`
- **`packages/visual-diff/src/policy.mjs`** — the one literal: tiers, themes, viewports, capture modes and the pinned `HOST` fingerprint, consumed identically by capture, Storybook's preview decorator and the layering lint
- **`apps/blog/lib/posts.ts`** — MDX read, Zod-validated frontmatter, reading time
- **`scripts/complexity-gate.mjs`** — cognitive-complexity ceiling of 20 per function; workspace mode for turbo, `--scope` mode for `.sandcastle/`

## 🔧 Configuration

- `turbo.json` — `build`/`lint`/`typecheck`/`test` (+`dependsOn: ["^build"]`), `e2e` (dependsOn `@gate/blog#build` and `@gate/visual-diff-ui#build`, uncached), `health` (whose `inputs` include `$TURBO_ROOT$/scripts/complexity-gate.mjs`, so editing the gate script busts every cached result), `dev`, `clean`. `build.env` is `VERCEL_ENV` and `NEXT_PUBLIC_BUGSINK_DSN` — the two values inlined into a bundle at build time. `BUGSINK_DSN` is deliberately absent: the server reads it per request, so changing it must not invalidate a build
- `pnpm-workspace.yaml` — apps/* + packages/*; `allowBuilds` for sharp, unrs-resolver
- `package.json` — pnpm 11.20.0 pinned (sha512), Node `>=22.14.0 <23`, turbo ^2.10.11. `@types/node` is deliberately held on the `^22` line: it describes the runtime `engines` pins and `.sandcastle/Dockerfile` (`node:22-bookworm`) runs, so a newer major would type built-ins that do not exist here. It moves when the runtime moves, not when `ncu` says so
- `.github/rulesets/main.json` — the branch ruleset as committed JSON: PR required, squash-only, `gate` the sole required status check, no bypass actors
- `.gitattributes` — `designs/*.pen` binary
- Exact pins that are never bot-bumped: `@playwright/test` and `playwright` at `1.62.1`, matched to the `mcr.microsoft.com/playwright:v1.62.1-noble` capture container

## 📚 Documentation

- `README.md` — thesis, status table, the autonomous loop
- `AGENTS.md` — the routing table agents read first
- `.sandcastle/agent-docs/CODING_STANDARDS.md` — the review contract (testing conventions, scope discipline)
- `apps/storybook/src/docs/` — the published written half: System Design, Atomic Design, QA, DevOps, Skills
- `packages/visual-diff/README.md` — capture matrix, determinism controls, exit codes, and why the job never joins `gate.needs`
- `apps/e2e/README.md` — the three-layer split, the tag→project matrix and the three visual-diff worlds
- `designs/exports/` — component library (normative inventory), flows & decisions, pages, visual-diff pages (Board 04 — console `/` and `/report/[id]`)

## 🧪 Tests

- Orchestrator hermetic suite: 39 files / 654 tests (prompt contracts, merge flow, override grammar, worktree safety, provenance guard)
- Workspace suites, all in the `test` gate job: `packages/ui` 35 files / 512 tests (70% coverage floor), `apps/blog` 18 / 378 (375 passed, 3 skipped — one per draft post), `packages/visual-diff` 10 / 327, `apps/storybook` 5 / 128, `apps/visual-diff-ui` 53 / 829 (floors 93/87/92/94), `packages/logger` 2 / 20, `apps/manual` 6 / 69
- `apps/e2e`: 44 acceptance scenarios across smoke, blog, axe a11y, the visual-diff console, sample mode, the report and its accessibility treatment — in `gate.needs`, blocking. `EXPECTED_SCENARIOS` in `apps/e2e/scripts/suite-integrity.mjs` is the count that must agree. A second lane, `features/local/`, is two scenarios that write to your own tree and clean up after themselves — one captures, compares, reviews and accepts against your `.visual-diff`, the other proves the dev server reflects `apps/blog/content/posts` as it is, which no built app can claim (`EXPECTED_LOCAL_SCENARIOS`). It refuses to run under `CI` and gates nothing
- `packages/visual-diff`: 158 committed baselines; the capture/compare job runs on every PR but is deliberately never in `gate.needs` (see `packages/visual-diff/README.md#ci-status`)

## 🔗 Key Dependencies

- `@ai-hero/sandcastle` 0.12.0 — sandbox engine under `.sandcastle/`
- `next` ^16.3.2 / `react` ^19.2.8 — blog and storybook
- `storybook` 10 with `nextjs-vite` — the visual single source of truth
- `playwright` 1.62.1 (exact) — acceptance suite and pixel capture
- `turbo` ^2.10.11 — task graph + remote cache (team-ID-scoped)

## 📝 Quick Start

1. `pnpm install`
2. `pnpm lint && pnpm build && pnpm test && pnpm typecheck` — all green from the root
3. `pnpm format:check && pnpm health:check` — the other two `checks` matrix legs
4. `pnpm test:sandcastle` — the orchestrator's own contracts
