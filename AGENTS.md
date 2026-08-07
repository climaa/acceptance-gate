# AGENTS.md — routing table

You are working inside a checkout of `climaa/acceptance-gate`. Everything you
need is in this repo; nothing outside it is reachable or required. Issue bodies
are self-contained — treat them as the spec.

## Read this before touching…

| …this                    | Read first                                                                                 | Why                                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Anything                 | [`.sandcastle/agent-docs/CODING_STANDARDS.md`](.sandcastle/agent-docs/CODING_STANDARDS.md) | The review contract: testing conventions (AAA, pyramid, regression-with-bugfix), scope discipline, the don'ts                         |
| `packages/ui` components | [`designs/exports/component-library.png`](designs/exports/component-library.png)           | The normative inventory — names, tiers, variants are decided there, never re-decided in code                                          |
| Anything visual          | [`packages/ui/src/tokens.css`](packages/ui/src/tokens.css)                                 | Token-only styling; the audit block inside lists what is pruned/pending. Theme switch is `[data-theme]`, never `prefers-color-scheme` |
| Page layouts             | [`designs/exports/pages.png`](designs/exports/pages.png)                                   | Index / post / tag in all four capture variants                                                                                       |
| Design rationale         | [`designs/exports/flows-decisions.png`](designs/exports/flows-decisions.png)               | Typography and dark-mode decisions with their whys                                                                                    |
| `features/**`            | Stop                                                                                       | `.feature` files are product requirements — never edited to make a test pass. Say so in the PR and wait for human review              |
| `turbo.json`             | The comments in it                                                                         | Cache-input negations and task edges are load-bearing for the gate's correctness                                                      |
| `.github/workflows/`     | [`pr.yml`](.github/workflows/pr.yml) header comment                                        | `gate` aggregates everything; new jobs must join `gate.needs` unconditionally                                                         |

## Conventions in one breath

`@gate/*` scope · `workspace:*` protocol · source-direct packages (no build
step) · English only in public artifacts · commits explain why, never cite
private sources · fonts self-hosted woff2 only (one documented TTF exemption
for OG images) · no `packages/ui` component animates on mount (Skeleton's
CSS shimmer is the one sanctioned exception).

## Labels that route you

`sc:{implementer,reviewer}:{opus-5,sonnet-5}` and
`sc:{implementer,reviewer}:effort:{low,medium,high,xhigh,max}` — set at issue
authoring time. They route model and effort; they never gate dispatch.

## Tracking

The [project board](https://github.com/users/climaa/projects/1) mirrors the
issue lifecycle (Backlog → In Progress → Done, story points, burn-up per
wave). It is a window onto the pipeline, never a control surface.
