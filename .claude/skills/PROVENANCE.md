# Vendored Next.js agent skills

These are third-party skill files, copied in unmodified. They are committed rather than
installed because **committed git content is the only channel that reaches a Sandcastle
agent** — a skill that lives in `~/.claude/skills` exists for the host session and does not
exist inside the sandbox.

| | |
| --- | --- |
| Source | <https://github.com/vercel/next.js/tree/canary/skills> |
| Pinned commit | `ec1a44d0f112d7a3dd7ce5138ddde19a3a1a876b` |
| Vendored on | 2026-08-12 |
| Licence | MIT (`vercel/next.js`) |

## What is here

| Skill | Covers |
| --- | --- |
| `next-cache-components-adoption` | Enabling `cacheComponents` and walking an app to a passing build |
| `next-cache-components-optimizer` | Tuning the static shell and in-app navigation once it is on |
| `next-dev-loop` | Driving a dev-server iteration loop |
| `next-partial-prefetching-adoption` | Adopting partial prefetching |

That is the complete current set. `skills/.claude-plugin/` is deliberately not copied — it is
the marketplace manifest, not a skill.

## What is deliberately *not* here

`next-best-practices`, `next-cache-components` and `next-upgrade` were the three skills the
public directories still advertise. **All three were retired upstream**, and the replacements
are already in this repo:

- **`next-cache-components`** was split into the adoption and optimizer skills above. Those
  are its successors, not an alternative to it.
- **`next-best-practices`** is no longer a skill at all. Its content now ships as the bundled
  docs under `apps/blog/node_modules/next/dist/docs/` and the `AGENTS.md` / `CLAUDE.md` that
  `next dev` generates on Next.js 16.3+ — committed here in `fb99f06` (PR #208).
- **`next-upgrade`** is no longer a skill. Migration guides ship in the bundled docs; upgrades
  run through `npx @next/codemod@latest upgrade`.

Vendoring any of the three would pin a superseded copy next to its own replacement.

## Updating

Re-pin to a newer commit and re-copy every file; do not hand-edit. Upstream restructures these
between releases — at the vendored commit the optimizer ships `reference/`, `rig-template.md`
and `test-template.md`, where an older release shipped `instant-nav-loop.md` and `ppr-loop.md`.
A partial update leaves both layouts in place and the skill reads as self-contradictory.

Verify a copy with `shasum -a 256`:

| File | SHA-256 |
| --- | --- |
| `next-cache-components-adoption/SKILL.md` | `e0571079c1c8af832df28849a6087a71aa415af2f561a4d83ea4a2a477744baa` |
| `next-cache-components-adoption/references/dev-only-validations.md` | `57383f4216cf0409041cf0129f97bad0f489246f7c4fa9e7308576b6b843817f` |
| `next-cache-components-adoption/references/per-page-decisions.md` | `5064a7efdfe073bb644883edfa00ae919b60b8c76bf12d25b2e1e83b49913c83` |
| `next-cache-components-optimizer/SKILL.md` | `9b538b7f58241f8d6d808a35967bd8b0624f3ae97f7904ab51b294b05e533210` |
| `next-cache-components-optimizer/reference/patterns.md` | `18342f107289cee068c68b1beae2fa8634864263468518a3d6ceeb400bb78c30` |
| `next-cache-components-optimizer/reference/real-app-patterns.md` | `d3cde1f0cfa075c3d4f85861c163f7d7512b13da1c2412e117cb9c5c4f9a146d` |
| `next-cache-components-optimizer/reference/red-test-robustness.md` | `07b85e34fdf5897eadc6c07f62b1bee5017bdb260e42dc63bff45e1eda76715e` |
| `next-cache-components-optimizer/rig-template.md` | `7c170e80a5b50c6efc5f608d6ca9c4952d5c82d5ebe6cb3cb65c43fee517aba1` |
| `next-cache-components-optimizer/test-template.md` | `7e58cf538ce3c42dcbc084fa4ae702d5e8a42fc4015a0c1eda2305de4bc614d1` |
| `next-dev-loop/SKILL.md` | `07c8721871d56e7a0f19296bce8472ad518f8bf1c69065d06cec337fc1fdb491` |
| `next-partial-prefetching-adoption/SKILL.md` | `cababb0e870d19d527295b3e6c0cf4c882741e23ec76b6909391a3be1b5debc1` |
