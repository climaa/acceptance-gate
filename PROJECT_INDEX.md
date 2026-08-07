# Project Index: acceptance-gate

Generated: 2026-08-06 (regenerate with `/sc:index-repo` — a stale date here means the index needs a refresh)

## 📁 Project Structure

```
.sandcastle/           the autonomous orchestrator (public, self-tested)
  main.mts             serial issue loop: plan → implement → review → merge
  sandcastle-*.mts     config · agent profiles · model overrides · lifecycle ·
                       merge · run-issue · stranded-branches · worktree safety ·
                       build-verify · git · image freshness
  agent-docs/          the four phase prompts + CODING_STANDARDS.md
  __tests__/           20 hermetic vitest files (229 tests) guarding the contracts
apps/
  blog/                Next.js App Router + MDX (Spanish seed; EN is Wave 1)
packages/
  ui/                  design system: tokens.css + 7 seed components
  tsconfig/            shared TS configs
designs/               acceptance-gate.pen (Pencil source) + exports/*.png
.github/               pr.yml (the gate) · dependabot.yml · auto-merge workflow
```

## 🚀 Entry Points

- Pipeline: `pnpm sandcastle` → `.sandcastle/main.mts` (dispatch: open issues by repo owner)
- Blog: `pnpm dev` → `apps/blog` on :3000
- CI: `.github/workflows/pr.yml` → `gate` aggregator (only required check)
- Orchestrator tests: `pnpm test:sandcastle` → `vitest.sandcastle.config.mts`

## 📦 Core Modules

- **`.sandcastle/sandcastle-config.mts`** — constants: `BASE_BRANCH=main`, PATH fixes, turbo credentials read from the repo-root `.env` only (never `process.env`), with the expected team derived from `.turbo/config.json` → mismatch or missing link disables the cache
- **`.sandcastle/sandcastle-model-overrides.mts`** — `sc:<role>:<model|effort:*>` label grammar; resolution `PROFILES < SC_* env < issue label`
- **`.sandcastle/sandcastle-merge.mts`** — squash auto-merge flow; ~20-min poll window
- **`packages/ui/src/tokens.css`** — the single visual source of truth; light = parchment/terracotta, dark = terminal lime; audit block lists pruning work
- **`apps/blog/lib/posts.ts`** — MDX read, frontmatter, reading time

## 🔧 Configuration

- `turbo.json` — lint/build/test/typecheck (+`dependsOn: ["^build"]`); full task graph arrives by Wave 4
- `pnpm-workspace.yaml` — apps/* + packages/*; `allowBuilds` for sharp, unrs-resolver
- `package.json` — pnpm 11.17.0 pinned (sha512), Node `>=22.14.0 <23`, turbo ^2.10.8
- `.gitattributes` — `designs/*.pen` binary

## 📚 Documentation

- `README.md` — thesis, status table, the autonomous loop
- `AGENTS.md` — the routing table agents read first
- `.sandcastle/agent-docs/CODING_STANDARDS.md` — the review contract (testing conventions, scope discipline)
- `designs/exports/` — component library (normative inventory), flows & decisions, pages

## 🧪 Tests

- Orchestrator hermetic suite: 20 files / 229 tests (prompt contracts, merge flow, override grammar, worktree safety, provenance guard)
- Component/unit suites arrive with Wave 1 (70% floor); e2e Wave 3; visual-diff Wave 4

## 🔗 Key Dependencies

- `@ai-hero/sandcastle` 0.12.0 — sandbox engine under `.sandcastle/`
- `next` ^15 / `react` ^19 — blog (Next 16 upgrade is a Wave-1 issue)
- `turbo` ^2.10.8 — task graph + remote cache (team-ID-scoped)

## 📝 Quick Start

1. `pnpm install`
2. `pnpm turbo run lint build test typecheck` — all green from the root
3. `pnpm test:sandcastle` — the orchestrator's own contracts
