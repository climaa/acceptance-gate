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
lane cannot name anything — the data behind it is whatever the console suggested — so every
one of its assertions is an invariant **between values on the page**. It is one scenario
that captures its own set, compares it, reviews it, accepts it, and takes all of it back
out (see [The local lane](#the-local-lane)).

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

pnpm test:local                      # repo root: the local lane, headless — needs Docker
pnpm e2e:ui:local                    # repo root: the same lane in UI Mode, vs YOUR data
pnpm --filter @gate/e2e check:local  # the local guard alone — no browser, no server
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
build meet its requirements_, but _does the console work against my data_.

**One scenario, and it is the most expensive thing in this repo.** `pnpm test:local`
rebuilds Storybook, captures your whole corpus inside the pinned container, compares it,
reads the report through, promotes it into `<dataDir>/__baselines__`, and then removes
every one of those again. Budget minutes and a running Docker daemon.

**It touches nothing of yours.** It removes the set, the report and the promotion it made
**by name** — never by clearing a panel — so it runs the same on an empty console as on one
holding a week of your captures, and leaves either as it found it. That is deliberate: the
empty console is not an edge case, it is what a fresh checkout looks like, and a lane that
could only run once somebody had captured by hand was asserting requirements it could not
reach. It also means the lane can run twice in a row, which nothing before it could.

The lane used to end in an accept, and no longer does. What that accept promoted was the
data directory's own corpus — gitignored, and read by nothing — so it could never make
CI's `visual-diff` job pass and was not trying to. That is `accept-baselines.yml`'s job.
The console's accept tab is gone for the same reason; the committed corpus at
`packages/visual-diff/__baselines__` was never touched by either.

It was two files and nine scenarios until 2026-08-24, and a read-only half before that
(`report.feature` was the last of it). Both withdrawals are recorded in
`EXPECTED_LOCAL_SCENARIOS`, along with what each cost.

**Nothing can be named.** No set label, report id, story title or count is knowable, so an
assertion compares page values with each other and each step reads what it needs off the
page — the flow compares the two sets the pickers offer, and deletes _my oldest set_
rather than a set anyone chose. A scenario that needs a named fact belongs in
`features/acceptance/`, where the world is seeded to provide one.

**A machine with nothing captured fails, rather than skipping.** The `Background` fails
with a message naming what to run. A runtime skip would report `expectedStatus: "passed"`
to the guard below, leaving the lane silently asserting nothing on exactly the machine it
can vouch for least.

### The write permission

Both write guards in `steps/local/fixtures.ts` are still there, and neither refuses
anything on a normal run — every scenario in the lane carries `@mutating`. They are kept
for the scenario nobody has written yet, because a lane that lost its read-only half by
attrition will get read-only scenarios back sooner than it will get deliberately
destructive ones:

| Guard      | Refuses                                                   |
| ---------- | --------------------------------------------------------- |
| `readOnly` | every non-`GET` an untagged scenario's pages make         |
| `mayWrite` | any step reaching for `node:fs` from an untagged scenario |

The second exists because a `page.route` handler cannot see a filesystem write, and
because playwright-bdd resolves steps by text across the whole lane — a writing step is
callable by name from any scenario in it.

`@mutating` means something different here than in the acceptance lane, which no longer
has the tag at all. It is the **opt-out from both guards** — the whole of its meaning,
declared per scenario where a reader sees it.

And it is not self-granted. A permission anyone can hand themselves is not a permission:
the quickest way past a tripwire failure would otherwise be to add the tag the error
message just named. So `MUTATING_FEATURES` in `scripts/local-integrity.mjs` names the only
file whose scenarios may carry it, the guard refuses it on a `Feature` node — inherited, it
would arm the next scenario anyone appends with no line of its own in the diff — and it
refuses a listed file where no scenario carries it. Adding a writing scenario is a diff
someone reviews.

### Order, and repair

`@mode:serial` is gone with the scenarios it ordered. It coupled a file's scenarios into
one chain so a compare that never finished could not be followed by a lock impersonating
it; with a single scenario there is nothing to order, and `SERIAL_FEATURES` is empty. The
guard still refuses the tag on any file not named there, so putting it back is a decision
rather than an accident.

`workers: 1` stays. It has never mattered — the lane has never had two files running at
once — and it is what keeps a second file, if one ever lands, from shooting a corpus while
another deletes underneath it. That race passes most of the time, which is the worst kind.

The lane repairs itself twice over, and the second half is new with the collapse:

- the step that edits `history.json` writes a sidecar backup the next run restores, so a
  run killed mid-edit does not leave your newest real run reading as `interrupted` forever;
- an `After` hook removes the capture set, the report and the promotion for a run that went
  red before reaching its own teardown. Without it one red run leaves a set behind and the
  next no longer starts cold, which is the property the whole rewrite exists to hold.

There are no level tags. `@regression` and `@edge-case` were a vocabulary for choosing
between four files' worth of scenarios, and they are not coming back. `@accept` was a cost
switch for the two-file era and went with it: one scenario offers nothing to select. There
is still no `@smoke` — a smoke level exists to fail a pipeline fast, and this lane gates
nothing.

Like `E2E_BASE_URL`, the local config refuses to run under `CI`. The Storybook page
_Docs/QA/Acceptance Suite Locally_ is the long-form guide to both lanes.

## Suite integrity

Both lanes carry a guard, and both fail the run if their lane still exits 0 while claiming
less than it did — a scenario deleted, `@skip`, `@fixme`, `@fail`, `@only`, `@retries:N`,
or a project left running nothing. The checks live once in
`scripts/lib/suite-integrity-core.mjs`; each guard supplies what differs. Both drive
`playwright test --list`, which skips global setup, so neither needs a browser or a web
server and each costs about a second.

| Guard                         | Lane                   | Exact count                      | Also checks                                                                                                                |
| ----------------------------- | ---------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `scripts/suite-integrity.mjs` | `features/acceptance/` | `EXPECTED_SCENARIOS` **41**      | `@desktop`+`@mobile` at once; every `.feature` under `features/` is in a lane; `@mode:serial` only on a declared flow file |
| `scripts/local-integrity.mjs` | `features/local/`      | `EXPECTED_LOCAL_SCENARIOS` **1** | `@mode:serial` only on a declared flow file                                                                                |

The acceptance total covers the blog and its accessibility sweep, the visual-diff
console, sample mode, the report and its accessibility treatment; 1 is the whole local
lane — one scenario that captures its own input and removes it. The number itself lives
in `EXPECTED_SCENARIOS` and nowhere else, deliberately: it was written out here as a
sum of six terms, and stayed at 42 through the PR that retired baseline acceptance and
the two that added a console and a sample scenario — stale in the one document that
warns a count repeated in prose goes stale silently. Adding a scenario raises the
constant in the same PR. Lowering one is a
product decision — a hand-authored PR with the reason written down, never a step on the
way to green. That is what took the local count from 20 to 5: the console, accessibility
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

One report. `main-2026-08-17__main-2026-08-13` carries the fabricated accessibility
failure, and it is what the report and a11y suites read. There was a second, clean one
until the console's accept tab was retired — the accept gate refused an accessibility
failure before it asked anything else, so a world holding only the grafted report could
never reach the gate's other two answers. No gate, no need for the second report.

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
