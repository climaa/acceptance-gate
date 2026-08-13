# @gate/e2e

The acceptance suite: Gherkin `.feature` files compiled to Playwright specs by
[playwright-bdd](https://vitalets.github.io/playwright-bdd/), run against the **built**
blog. It sits at the top of the testing pyramid — a handful of user journeys, never a
second home for what a unit test can catch. Adding a scenario for something a unit test
could assert is a review finding.

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
turbo run e2e                        # the full run, after building the blog it boots
```

`turbo run e2e` is the entry point that matters: the task depends on `@gate/blog#build`,
so what the suite boots is what the build produced. `playwright.config.ts` starts
`next start` on port **3100** (not 3000 — a dev server may already hold that) and
`E2E_BASE_URL` overrides the target for a run against an already-running deployment.
That override is **local-only**: under `CI` the config throws rather than honour it,
because a merge-gating check that passes against a live deployment says nothing about
the commit under review.

Browsers are not installed by `pnpm install`; a first local run needs
`pnpm --filter @gate/e2e exec playwright install chromium`.

## Suite integrity

`scripts/suite-integrity.mjs` runs before `playwright test` and fails the run if the
suite still exits 0 while claiming less than it did — a scenario deleted, `@skip`,
`@fixme`, `@fail`, `@only`, `@retries:N`, or a project left running nothing. It drives
`playwright test --list`, which skips global setup, so it needs no browser and no web
server and costs about a second.

`EXPECTED_SCENARIOS` in that file is an exact count, **8** today. Adding a scenario
raises it in the same PR. Lowering it is a product decision — a hand-authored PR with
the reason written down, never a step on the way to green.

## Tags select projects

The suite defines two projects, `desktop` (Desktop Chrome) and `mobile` (Pixel 5,
Android Chrome — so both share the one Chromium install). A scenario's tags pick which
of them run it:

| Tag on the scenario | Runs in        |
| ------------------- | -------------- |
| `@desktop`          | `desktop` only |
| `@mobile`           | `mobile` only  |
| _untagged_          | both projects  |

Untagged is the default on purpose: a journey that is only claimed on one form factor
should say so out loud. Both tags at once means neither project runs it — each project
excludes the other's tag — so the integrity guard refuses that combination by name.

## Version pins

`@playwright/test` is pinned **exactly**, no caret. Wave 4 transcribes that version into
the visual-diff capture container tag, which carries a placeholder until then — so a
Playwright bump moves the image tag, the baselines and this pin together, a hand-authored
change and never a bot PR. Dependabot ignores `@playwright/*` for that reason.
