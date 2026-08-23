# @gate/e2e

Two Gherkin lanes, compiled to Playwright specs by
[playwright-bdd](https://vitalets.github.io/playwright-bdd/). Both sit at the top of the
testing pyramid — a handful of user journeys, never a second home for what a unit test can
catch. Adding a scenario for something a unit test could assert is a review finding.

| Lane                   | Runs against                                        | Gates merges               | Config                       |
| ---------------------- | --------------------------------------------------- | -------------------------- | ---------------------------- |
| `features/acceptance/` | the **built** blog and console, on seeded worlds    | yes                        | `playwright.config.ts`       |
| `features/local/`      | the **dev** console on 3300 and YOUR `.visual-diff` | never — refuses under `CI` | `playwright.local.config.ts` |

The acceptance lane names seed facts, because its worlds are built to hold them. The local
lane cannot name anything — the data behind it is whatever your machine captured — so every
one of its assertions is an invariant **between values on the page**: the buckets sum to the
total, the review denominator is every bucket except unchanged, a bucket and a search term
survive a reload. It is also strictly read-only, and that is enforced rather than promised (see
[The local lane](#the-local-lane)).

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

`features/` and `steps/` each split by lane (`acceptance/`, `local/`); `pages/` does not.
That asymmetry is the point: the two lanes ask different questions of the **same** markup,
so they share one selector contract and a rename in `packages/ui` is still a one-file edit
here. What they must not share is a `test` instance — each lane's `steps` glob reaches only
its own `fixtures.ts`, so a local scenario can never bind to page objects that navigate to
the acceptance worlds on 3200-3201. Prefer role-based locators (`getByRole`) over CSS: they hold
through a restyle, and a locator that cannot find the role is usually a real
accessibility defect rather than a broken test.

Page objects reach steps through `steps/fixtures.ts`, not `new` inside a step — one
instance per scenario, shared across its steps. That file sits under `steps/` because the
`steps` glob is the only place `bddgen` scans for the extended `test` instance.

## Running

```bash
pnpm --filter @gate/e2e test:e2e     # acceptance: bddgen + check:suite + playwright test
pnpm --filter @gate/e2e check:suite  # the acceptance guard alone — no browser, no server
turbo run e2e                        # the full acceptance run, after building both apps
pnpm e2e:ui                          # repo root: build both apps, open UI Mode's live picker

pnpm --filter @gate/e2e test:local   # local: bddgen + check:local + playwright test
pnpm --filter @gate/e2e check:local  # the local guard alone
pnpm e2e:ui:local                    # repo root: the local lane in UI Mode, vs YOUR data
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

`pnpm e2e:ui` is the acceptance suite in Playwright UI Mode — a live picker over the same
worlds, for watching a scenario's actions rather than reading its verdict. One thing the
`test:e2e` chain does that it does not: run `check:suite` at all.

**`bddgen` is not optional after a `.feature` edit.** It compiles each lane's specs and
freezes the fixtures each step asked for at generation time, so a step that grows a new
fixture argument reads as `undefined` until the specs are regenerated. Every script above
runs it first for that reason; a bare `playwright test` does not.

## The local lane

`features/local/` answers a different question from the acceptance suite: not _does this
build meet its requirements_, but _does the console work against my data_. Three rules
follow from what that data is.

**Read-only, and enforced — unless a scenario says otherwise out loud.** The tree behind
3300 is the one copy you have. No untagged scenario may delete, prune, accept or start a
job. `steps/local/fixtures.ts` enforces that twice over: `readOnly` blocks every non-`GET`
request before it reaches the server, and `mayWrite` refuses any step that reaches for
`node:fs` — a `page.route` handler cannot see a filesystem write, and playwright-bdd
resolves steps by text across the whole lane, so a writing step is callable by name from
any scenario. Prose would not have stopped a step that grew the wrong `.click()`. The one
way through either is `@mutating` on the scenario — see **The one flow that writes**
below.

**Nothing can be named.** No set label, report id, story title or count is knowable, so an
assertion compares page values with each other. A scenario that needs a named fact belongs
in `features/acceptance/`, where the world is seeded to provide one.

**Real data is usually boring.** A run where nothing moved counts every variant as
`unchanged` and writes no rows at all, which is the commonest report there is. So no
scenario may depend on a story card existing, and the ones that walk cards are written to
hold — non-vacuously — when there are none. That is why the review loop, the comparison
modal and the accept gate stay in the acceptance lane.

A machine with nothing captured **fails** this lane on its `Background` rather than
skipping it, with a message naming what to run. A runtime skip would report
`expectedStatus: "passed"` to the guard below, leaving the lane silently asserting nothing
on exactly the machine it can vouch for least.

### Levels

The local lane carries no tags. `@regression` and `@edge-case` were its two levels while
it held console, accessibility and edge-case requirements; with only `report.feature`
left there was nothing to select between, and a vocabulary with one member selects
nothing. Scenarios here are run as a lane or picked by name in UI Mode. There is still no
`@smoke`: a smoke level exists to fail a pipeline fast, and this lane gates nothing.

`check:local` no longer carries a level rule, so nothing stops a tag being added back —
but `features/acceptance/` is where tags are load-bearing today (its two projects grep
on them), and a level returning here should bring its rule back with it.

### The one flow that writes

`features/local/visual-diff-flow.feature` is the exception to everything above, and it says
so in its own first paragraph. Its five scenarios **write to your `.visual-diff`**: they
launch a compare, take its job lock, delete your oldest capture set and prune one more.
Nothing re-seeds afterwards — a run costs you two sets. It runs on every `pnpm test:local`
and `pnpm e2e:ui:local`, because this lane has one project and no tag filter; short of
`--grep-invert @mutating` there is no way to run the lane without it.

`@mutating` means something different here than in the acceptance lane. There it selects a
project. Here it is the **opt-out from both write guards** — the whole of its meaning,
declared per scenario where a reader sees it. Everything untagged is still blocked from
writing, which is why the tag keys the exemption rather than the config.

And it is not self-granted. A permission anyone can hand themselves is not a permission:
the quickest way past a tripwire failure would otherwise be to add the tag the error
message just named. So `MUTATING_FEATURES` in `scripts/local-integrity.mjs` names the only
file whose scenarios may carry it, the guard refuses it on a `Feature` node — inherited, it
would arm the next scenario anyone appends with no line of its own in the diff — and it
refuses a listed file where no scenario carries it. Adding a writing scenario is a diff
someone reviews.

`@mode:serial` keeps the chain honest: the scenarios run in the order written and Playwright
skips every one after a failure, so a compare that never finished cannot be followed by a
lock that impersonates it. `SERIAL_FEATURES` in `scripts/local-integrity.mjs` names this
file as the only one allowed to carry the tag, under the same four rules the acceptance
guard applies.

Three consequences worth knowing. The lane runs `workers: 1`, because the flow rewrites the
same tree `report.feature` reads — and with `fullyParallel` unset that makes the whole lane
sequential. Nothing here is named, as everywhere in this lane: each step reads the labels
off the page, so the flow deletes _my oldest set_ rather than a set anyone chose. And the
flow repairs itself: the one step that edits `history.json` writes a sidecar backup first,
which the `Background` restores if a previous run was killed before its hook could put the
file back.

Like `E2E_BASE_URL`, the local config refuses to run under `CI`. The Storybook page
_Docs/QA/Acceptance Suite Locally_ is the long-form guide to both lanes.

## Suite integrity

Both lanes carry a guard, and both fail the run if their lane still exits 0 while claiming
less than it did — a scenario deleted, `@skip`, `@fixme`, `@fail`, `@only`, `@retries:N`,
or a project left running nothing. The checks live once in
`scripts/lib/suite-integrity-core.mjs`; each guard supplies what differs. Both drive
`playwright test --list`, which skips global setup, so neither needs a browser or a web
server and each costs about a second.

| Guard                         | Lane                   | Exact count                       | Also checks                                                                                                                |
| ----------------------------- | ---------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `scripts/suite-integrity.mjs` | `features/acceptance/` | `EXPECTED_SCENARIOS` **47**       | `@desktop`+`@mobile` at once; every `.feature` under `features/` is in a lane; `@mode:serial` only on a declared flow file |
| `scripts/local-integrity.mjs` | `features/local/`      | `EXPECTED_LOCAL_SCENARIOS` **11** | `@mode:serial` only on a declared flow file                                                                                |

41 is 9 blog + 4 visual-diff console + 3 sample mode + 15 report + 7 accessibility + 3
baseline acceptance; 11 is 6 report + 5 mutating flow. Adding a scenario raises its count in the same PR. Lowering one is a
product decision — a hand-authored PR with the reason written down, never a step on the
way to green. That is what took the local count from 20 to 6: the console, accessibility
and edge-case requirements were withdrawn from the lane, not narrowed to pass.

The lane-coverage check exists because the two `features` globs are narrow: a file left at
`features/whatever.feature` is compiled by neither config, so it is listed by no `--list`,
counted by no total and scanned by no tag rule. It would be a requirement that runs nowhere
and reads exactly like one that runs. The acceptance guard catches it, because that is the
one that runs in CI.

The local guard only ever runs on a developer's machine — its config refuses under `CI`.
That is precisely why it exists: a lane with no gate behind it is the easiest one to
narrow quietly, so `test:local` and `e2e:ui:local` both run it before opening a browser.

## Tags select projects

The suite defines two projects: `desktop` (Desktop Chrome) and `mobile` (Pixel 5, Android
Chrome — so both share the one Chromium install). A scenario's tags pick which of them
run it:

| Tag on the scenario | Runs in                |
| ------------------- | ---------------------- |
| `@desktop`          | `desktop` only         |
| `@mobile`           | `mobile` only          |
| _untagged_          | `desktop` and `mobile` |

Untagged is the default on purpose: a journey that is only claimed on one form factor
should say so out loud. `@desktop` and `@mobile` at once means neither project runs it —
each project excludes the other's tag — so the integrity guard refuses that combination
by name.

This suite has no mutating project any more. The requirements that wrecked a world —
launch a job, promote baselines, delete a set, prune the rest — moved to
`features/local/visual-diff-flow.feature`, where they run against the `.visual-diff` tree
on the machine doing the running. **Nothing gates them on a pull request.** That is a
deliberate trade, recorded in `EXPECTED_SCENARIOS` where it can be read back: the accept
path is now covered only by whoever runs `pnpm test:local`.

`@mutating` still exists as a tag, and it means something else there — the permission to
write, and the only way past the local lane's read-only tripwire. It selects no project in
this suite.

## The two visual-diff worlds

The console's interesting states are trees on disk, not code paths, so one build of
`@gate/visual-diff-ui` is booted twice against two data directories:

| World    | Port   | `VISUAL_DIFF_DATA_DIR`   | Who may write to it          |
| -------- | ------ | ------------------------ | ---------------------------- |
| `seeded` | `3200` | `.worlds/seeded`         | nobody — read-only scenarios |
| `sample` | `3201` | `.worlds/sample` (empty) | nobody — there is nothing to |

Both are read-only, which is the whole of why this suite is order-independent. The world a
job ran in was the third, on `3202`; it went with the scenarios that wrecked it.

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

Scenarios stay order-independent because of what the worlds are, not because anyone
asserts it: review marks live in `localStorage` and every test gets a fresh context, and
neither world is ever written to. The seed script still understands `--mutating` — it is
what wrote baselines and skipped the worktree hold — and `apps/visual-diff-ui`'s own unit
tests still exercise that flag; nothing in this suite passes it.

`apps/visual-diff-ui/__tests__/seed.test.ts` reads the seed's output back through that
app's own zod schemas and re-runs it to check the tree is the same twice — a seed the
console cannot parse fails there, in seconds, rather than three scenarios into a browser
run.

## Version pins

`@playwright/test` is pinned **exactly**, no caret. That same version is transcribed into
the visual-diff capture container tag (`mcr.microsoft.com/playwright:v1.62.1-noble`, named
in `packages/visual-diff/src/policy.mjs` and again in this workspace's
`pages/visual-diff-hosts.ts`, which is where the accept scenario reads it from) — so a Playwright bump moves the image tag, the baselines and this pin
together, a hand-authored change and never a bot PR. Dependabot ignores `@playwright/*`
for that reason.
