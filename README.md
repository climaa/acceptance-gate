# acceptance-gate

> **Work in progress — bootstrap phase.** This repo is being built by its own agent
> pipeline; the full README lands at the end of Phase 0. The
> [open issues](https://github.com/climaa/acceptance-gate/issues) and the
> [project board](https://github.com/users/climaa/projects/1) are the live roadmap.

A public portfolio monorepo where **the pipeline is the product**:

```
lint → build → test (Playwright + Gherkin) → visual-diff
                                              ↑ over threshold = PR blocked
```

| Package | What it is |
|---|---|
| `apps/blog` | Public blog — Next.js App Router + MDX |
| `packages/ui` | Design system: tokens + primitives (source-direct, no build step) |
| `packages/tsconfig` | Shared TypeScript configs |

More is coming by agent-executed issue waves: Storybook, a Playwright/Gherkin
acceptance suite, and a self-built visual-regression CLI that gates every PR.

## Quick start

```bash
pnpm install
pnpm dev          # blog on :3000
pnpm build
pnpm lint
pnpm typecheck
```

Toolchain is pinned: pnpm 11.17 (`packageManager` + sha512), Node 22 (`.nvmrc`).

## The one design-system rule

**No component hardcodes a value.** Everything resolves through a custom property in
`packages/ui/src/tokens.css`; dark mode remaps only the semantic roles
(`--color-bg`, `--color-text`, `--color-accent`…), never the raw scale.
Rebranding = editing one file.

## Notes

The two posts under `apps/blog/content/posts/` are Spanish drafts from the seed;
translating them is a Wave-1 issue. Everything in this repo ships in English.
