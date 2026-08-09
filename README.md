# acceptance-gate

[![pr](https://github.com/climaa/acceptance-gate/actions/workflows/pr.yml/badge.svg)](https://github.com/climaa/acceptance-gate/actions/workflows/pr.yml)

**The pipeline is the product.** A public portfolio monorepo where every pull
request — including the ones that build the repo itself — walks through the
same gate:

```
lint · typecheck · build · test · format · health · sandcastle  (parallel)  →  gate
                             ↑ e2e (Wave 3) and visual-diff (Wave 4) join gate.needs later
```

And the part that raises the bar: **this repo is built by its own published
agent pipeline.** The autonomous multi-agent orchestrator in
[`.sandcastle/`](.sandcastle/) — which I built and ran across previous
production work — plans, implements, reviews and merges GitHub issues through
the CI this repo builds for itself. The PR history is the evidence: pipeline
merges carry their model co-author trailer in the squashed commit.

> **Work in progress, in public — deliberately.** The
> [project board](https://github.com/users/climaa/projects/1) is the live,
> story-pointed roadmap; [open issues](https://github.com/climaa/acceptance-gate/issues)
> track in-flight work. Watching this repo means watching the pipeline work.

## What's here, what's coming

| Piece                                                           | Status                                                                                                                   |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `.sandcastle/` — the orchestrator, with its hermetic test suite | ✅ committed, public                                                                                                     |
| `designs/` — the design source of truth + PNG exports           | ✅ normative component inventory, two theme personalities                                                                |
| `apps/blog` — Next.js App Router + MDX, consumes `@gate/ui`     | ✅ seed, English                                                                                                         |
| `packages/ui` — atomic design system, token-only styling        | ✅ 7 seed components, consumed by the blog · 🔜 Wave 1 completes the 19-component inventory, layering enforced by ESLint |
| `apps/storybook` — the visual single source of truth            | 🔜 Wave 2                                                                                                                |
| `apps/e2e` — playwright-bdd acceptance suite                    | 🔜 Wave 3                                                                                                                |
| `packages/visual-diff` — the self-built CLI that gates PRs      | 🔜 Wave 4                                                                                                                |

## The design system, in one rule

**No component hardcodes a visual value.** Everything resolves through a
custom property in [`packages/ui/src/tokens.css`](packages/ui/src/tokens.css);
dark mode remaps only the semantic roles. The two themes are deliberate
opposite personalities — editorial parchment with terracotta in light,
terminal lime on green-black in dark — so a theme-wiring bug can never hide
as "both themes look the same":

![Component library](designs/exports/component-library.png)

## Quick start

```bash
pnpm install
cp .env.example .env  # turbo remote-cache credentials — see the comments inside
pnpm dev              # blog on :3000
pnpm lint && pnpm typecheck && pnpm build && pnpm test
pnpm format:check && pnpm health:check
pnpm test:sandcastle  # the orchestrator's own hermetic suite
```

Those last three lines are the seven parallel gate jobs from the diagram above,
in the same order.

Run turbo through the `pnpm` scripts rather than `pnpm turbo run ...` directly.
The scripts wrap turbo in `dotenv -e .env -o --` so its credentials come from
this repo's `.env` and never from your shell — a `TURBO_TEAM` exported in a
shell profile would otherwise apply to every repo on the machine.

Toolchain pinned: pnpm 11.20.0 (`packageManager` + sha512), Node 22 (`.nvmrc`),
Turborepo ^2.10.

## How the autonomous loop works

1. I decompose the roadmap into self-contained, story-pointed GitHub issues
   (dependency notes, verification commands, do-not-touch lists).
2. `pnpm sandcastle` plans the open backlog, then per issue: implements in a
   Docker sandbox → reviews with a second agent → opens a PR → squash
   auto-merge once the `gate` check is green.
3. `sc:*` labels route model and reasoning effort per issue. Testing
   conventions are enforced in review: AAA shape, testing-pyramid placement,
   every bug fix lands with its regression test.

Rules that keep it honest live in
[`.sandcastle/agent-docs/CODING_STANDARDS.md`](.sandcastle/agent-docs/CODING_STANDARDS.md) —
including the one that matters most: _`.feature` files describe product
requirements and are never edited to make a test pass._

## License

[MIT](LICENSE)
