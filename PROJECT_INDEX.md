# Project Index: acceptance-gate

Version 1.0.0 · generated 2026-08-14 (regenerate with `/sc:index-repo` — a stale date here
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
                       RSS, sitemap, OG images; Cache Components + Partial Prefetching on
  storybook/           Storybook 10 + nextjs-vite — 18 stories, 13 docs pages
  e2e/                 playwright-bdd acceptance suite — 9 Gherkin scenarios
  visual-diff-ui/      Next.js 16 console over the differ — zod-validated read path,
                       locked job runner + guarded mutations, sample fixtures,
                       the dashboard's sets/reports/history tables;
                       the run panel and report screens land by issue
packages/
  ui/                  design system: tokens.css + 19 components in 4 tiers
  visual-diff/         the self-built visual-regression CLI + 106 committed baselines
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
- Visual-diff console: `pnpm --filter @gate/visual-diff-ui dev` on :3300 (`VISUAL_DIFF_DATA_DIR` to read real runs; unset = committed sample data)
- Acceptance suite: `pnpm turbo run e2e` (builds the blog first, then runs the scenarios)
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

- `turbo.json` — `build`/`lint`/`typecheck`/`test` (+`dependsOn: ["^build"]`), `e2e` (dependsOn `@gate/blog#build`, uncached), `health` (whose `inputs` include `$TURBO_ROOT$/scripts/complexity-gate.mjs`, so editing the gate script busts every cached result), `dev`, `clean`
- `pnpm-workspace.yaml` — apps/* + packages/*; `allowBuilds` for sharp, unrs-resolver
- `package.json` — pnpm 11.20.0 pinned (sha512), Node `>=22.14.0 <23`, turbo ^2.10.9. `@types/node` is deliberately held on the `^22` line: it describes the runtime `engines` pins and `.sandcastle/Dockerfile` (`node:22-bookworm`) runs, so a newer major would type built-ins that do not exist here. It moves when the runtime moves, not when `ncu` says so
- `.github/rulesets/main.json` — the branch ruleset as committed JSON: PR required, squash-only, `gate` the sole required status check, no bypass actors
- `.gitattributes` — `designs/*.pen` binary
- Exact pins that are never bot-bumped: `@playwright/test` and `playwright` at `1.62.1`, matched to the `mcr.microsoft.com/playwright:v1.62.1-noble` capture container

## 📚 Documentation

- `README.md` — thesis, status table, the autonomous loop
- `AGENTS.md` — the routing table agents read first
- `.sandcastle/agent-docs/CODING_STANDARDS.md` — the review contract (testing conventions, scope discipline)
- `apps/storybook/src/docs/` — the published written half: System Design, Atomic Design, QA, DevOps, Skills
- `packages/visual-diff/README.md` — capture matrix, determinism controls, exit codes, and why the job never joins `gate.needs`
- `apps/e2e/README.md` — the three-layer split and the tag→project matrix
- `designs/exports/` — component library (normative inventory), flows & decisions, pages, visual-diff pages (Board 04 — console `/` and `/report/[id]`)

## 🧪 Tests

- Orchestrator hermetic suite: 39 files / 654 tests (prompt contracts, merge flow, override grammar, worktree safety, provenance guard)
- Workspace suites, all in the `test` gate job: `packages/ui` 22 files / 308 tests (70% coverage floor), `apps/blog` 12 / 286, `packages/visual-diff` 10 / 291, `apps/storybook` 4 / 99, `apps/visual-diff-ui` 11 / 203
- `apps/e2e`: 9 Gherkin scenarios across smoke, blog and axe a11y — in `gate.needs`, blocking
- `packages/visual-diff`: 106 committed baselines; the capture/compare job runs on every PR but is deliberately never in `gate.needs` (see `packages/visual-diff/README.md#ci-status`)

## 🔗 Key Dependencies

- `@ai-hero/sandcastle` 0.12.0 — sandbox engine under `.sandcastle/`
- `next` ^16.3.0 / `react` ^19.2.8 — blog and storybook
- `storybook` 10 with `nextjs-vite` — the visual single source of truth
- `playwright` 1.62.1 (exact) — acceptance suite and pixel capture
- `turbo` ^2.10.9 — task graph + remote cache (team-ID-scoped)

## 📝 Quick Start

1. `pnpm install`
2. `pnpm lint && pnpm build && pnpm test && pnpm typecheck` — all green from the root
3. `pnpm format:check && pnpm health:check` — the other two `checks` matrix legs
4. `pnpm test:sandcastle` — the orchestrator's own contracts
