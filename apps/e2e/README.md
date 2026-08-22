# @gate/e2e

The acceptance suite: Gherkin `.feature` files compiled to Playwright specs by
[playwright-bdd](https://vitalets.github.io/playwright-bdd/), run against the **built**
blog and the **built** visual-diff console. It sits at the top of the testing pyramid —
a handful of user journeys, never a second home for what a unit test can catch. Adding
a scenario for something a unit test could assert is a review finding.

## `.feature` files are product requirements

**A `.feature` file is never edited to make a test pass.** If a scenario fails and the
scenario looks wrong, say so in the PR and wait for human review — the diff must not
touch `features/`. Weakening a scenario is the same class of finding as weakening an
assertion.

## The three-layer split

| Layer       | Holds                                            | Never holds                      |
| ----------- | ------------------------------------------------ | -------------------------------- |
| `features/` | The requirement, in the product's own vocabulary | Selectors, URLs, mechanics       |
| `steps/`    | Intent → action, one step per Gherkin line       | Locators                         |
| `pages/`    | Locators and navigation — the markup coupling    | Assertions about the requirement |

`pages/` is the only layer coupled to markup, so a rename in `packages/ui` is a
one-file edit here. Prefer role-based locators (`getByRole`) over CSS: they hold
through a restyle, and a locator that cannot find the role is usually a real
accessibility defect rather than a broken test.

Page objects reach steps through `steps/fixtures.ts`, not `new` inside a step — one
instance per scenario, shared across its steps. That file sits under `steps/` because the
`steps` glob is the only place `bddgen` scans for the extended `test` instance.

## Running

```bash
pnpm --filter @gate/e2e test:e2e     # bddgen + check:suite + playwright test
pnpm --filter @gate/e2e check:suite  # the integrity guard alone — no browser, no server
turbo run e2e                        # the full run, after building both apps it boots
pnpm e2e:ui                          # repo root: build both apps, open UI Mode's live picker
pnpm e2e:ui:local                    # repo root: read-only smoke checks vs YOUR data on 3300
```

`turbo run e2e` is the entry point that matters: the task depends on `@gate/blog#build`
and `@gate/visual-diff-ui#build`, so what the suite boots is what the build produced.
`playwright.config.ts` starts the blog with `next start` on port **3100** (not 3000 — a
dev server may already hold that) and `E2E_BASE_URL` overrides the target for a run
against an already-running deployment. That override is **local-only**: under `CI` the
config throws rather than honour it, because a merge-gating check that passes against a
live deployment says nothing about the commit under review. It aims the blog suite
alone; the visual-diff worlds below are always the servers this config booted.

Browsers are not installed by `pnpm install`; a first local run needs
`pnpm --filter @gate/e2e exec playwright install chromium`.

`pnpm e2e:ui` is the suite in Playwright UI Mode — a live picker over the same worlds,
for watching a scenario's actions rather than reading its verdict. Two things the
`test:e2e` chain does that this lane does not: re-run `bddgen` after a `.feature` edit,
and run `check:suite` at all. `pnpm e2e:ui:local` is not the suite: it aims the plain
specs in `local/` (own config, `playwright.local.config.ts`) at the dev server on 3300
and whatever your real `.visual-diff` holds, which is why everything in that directory
is data-agnostic and strictly read-only — the scenarios in `features/` assert seed
facts and `@mutating` wrecks its world, so neither may ever touch real data. Like
`E2E_BASE_URL`, the local config refuses to run under `CI`. The Storybook page
_Docs/QA/Acceptance Suite Locally_ is the long-form guide to both lanes.

## Suite integrity

`scripts/suite-integrity.mjs` runs before `playwright test` and fails the run if the
suite still exits 0 while claiming less than it did — a scenario deleted, `@skip`,
`@fixme`, `@fail`, `@only`, `@retries:N`, or a project left running nothing. It drives
`playwright test --list`, which skips global setup, so it needs no browser and no web
server and costs about a second.

`EXPECTED_SCENARIOS` in that file is an exact count, **47** today: 9 blog + 9 visual-diff
console + 3 sample mode + 15 report + 7 accessibility + 4 baseline acceptance. Adding a
scenario raises it in the same PR. Lowering it is a product decision — a hand-authored PR
with the reason written down, never a step on the way to green.

## Tags select projects

The suite defines three projects: `desktop` (Desktop Chrome), `mobile` (Pixel 5, Android
Chrome — so both share the one Chromium install) and `mutating` (Desktop Chrome, one
worker). A scenario's tags pick which of them run it:

| Tag on the scenario | Runs in                        |
| ------------------- | ------------------------------ |
| `@desktop`          | `desktop` only                 |
| `@mobile`           | `mobile` only                  |
| `@mutating`         | `mutating` only, one at a time |
| _untagged_          | `desktop` and `mobile`         |

Untagged is the default on purpose: a journey that is only claimed on one form factor
should say so out loud. `@desktop` and `@mobile` at once means neither project runs it —
each project excludes the other's tag — so the integrity guard refuses that combination
by name.

`@mutating` is a world, not a form factor. Those scenarios wreck a server's data
directory — they launch a job, delete a snapshot set, prune the rest — so they leave
both base projects and run alone in a third one with `workers: 1` and
`fullyParallel: false`, in the order their `.feature` declares them. It is world
vocabulary, not playwright-bdd control vocabulary, so it is deliberately NOT in the
integrity guard's `CONTROL_TAGS` denylist.

## The three visual-diff worlds

The console's interesting states are three trees on disk, not three code paths, so one
build of `@gate/visual-diff-ui` is booted three times against three data directories:

| World      | Port   | `VISUAL_DIFF_DATA_DIR`   | Who may write to it               |
| ---------- | ------ | ------------------------ | --------------------------------- |
| `seeded`   | `3200` | `.worlds/seeded`         | nobody — read-only scenarios      |
| `sample`   | `3201` | `.worlds/sample` (empty) | nobody — there is nothing to      |
| `mutating` | `3202` | `.worlds/mutating`       | the `@mutating` project, serially |

`pages/visual-diff-hosts.ts` is the one place a world's URL, its directory and the
pinned image its server claims are written; `playwright.config.ts` and the steps both
read them from there.

**Seeding is the webServer's job, never a test's.** Each entry runs
`scripts/seed-visual-diff.mjs <dir>` before `next start`, so a scenario that needs the
world never has to run after the scenario that built it. The script wipes and rebuilds
the tree every boot: it copies `apps/visual-diff-ui/fixtures/` — the committed sample
run, which is a real regression and fabricates nothing — and applies the fabricated
overlay in `seed/visual-diff/` on top of the copy. The fixture itself is never touched.
The overlay is what the fixture cannot honestly show: a set captured from a dirty tree,
a worktree hold, all four outcome words, a removed variant and an accessibility failure.

Two reports, deliberately. `main-2026-08-17__main-2026-08-13` is the one carrying the
fabricated accessibility failure — what the report and a11y suites read — and
`main-2026-08-17__main-2026-08-16` is a clean comparison of the two newest sets, which is
the only kind an accept can promote from: the gate refuses an accessibility failure before
it asks anything else, so on a world holding only the first report the review gate and the
host warning are answers no scenario could ever reach. An accept scenario names the report
it means; nothing rides on which one the picker opens with.

The `sample` world seeds nothing at all. An empty data directory is exactly what a
deployed instance that has captured nothing looks like, so the app falls back to its
committed fixtures and badges itself — which is the state those scenarios are about.

The `mutating` world never reuses a running server (`reuseExistingServer: false`): its
tree is the one the last run wrecked, and re-seeding it is what keeps its scenarios
independent of that run. Its server also declares
`VISUAL_DIFF_FAKE_HOST_FINGERPRINT` — the D3 seam, server-side, inert for every scenario
except the matched-host accept.

Scenarios stay order-independent because of what the worlds are, not because anyone
asserts it: review marks live in `localStorage` and every test gets a fresh context, the
read-only worlds are never written to, and everything that does write is `@mutating`.

`apps/visual-diff-ui/__tests__/seed.test.ts` reads the seed's output back through that
app's own zod schemas and re-runs it to check the tree is the same twice — a seed the
console cannot parse fails there, in seconds, rather than three scenarios into a browser
run.

## Version pins

`@playwright/test` is pinned **exactly**, no caret. That same version is transcribed into
the visual-diff capture container tag (`mcr.microsoft.com/playwright:v1.62.1-noble`, named
in `packages/visual-diff/src/policy.mjs` and again in this workspace's
`pages/visual-diff-hosts.ts`, where the mutating world's server and the accept scenarios
both read it from) — so a Playwright bump moves the image tag, the baselines and this pin
together, a hand-authored change and never a bot PR. Dependabot ignores `@playwright/*`
for that reason.
