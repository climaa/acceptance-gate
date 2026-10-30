# Changelog

Every release of `acceptance-gate`, newest first. This file is the source: at each release
session the `Unreleased` section is written up, moved under its version, and the GitHub
Release body is copied from it — never written separately. The versions below were
transcribed from the GitHub Releases that existed when this file was created (2026-10-18).

## Unreleased

- Sessions get a UI/UX design reference: the third-party `ui-ux-pro-max` skill is vendored in `.claude/skills/` (styles, palettes, font pairings, UX and accessibility guidelines, stack notes, searched locally by a standard-library Python script). It is pinned to upstream `28b3b8d` (MIT), and `PROVENANCE.md` records the two changes made to it.

- When a Sandcastle iteration merges several PRs that each add a `CHANGELOG.md` line, the host-side PR queue no longer leaves every PR after the first for a human. It merges `main` into the DIRTY branch in a scratch worktree, keeps both entries (the branch's on top, as the newest), and pushes the merge from the host, so `pre-push` gates it. It never pushes where that hook would not run. It resolves only `CHANGELOG.md`, and only hunks where both sides added lines and neither edited one. A conflict in any other file, an edited line, or a merged lockfile that no longer installs frozen still goes to a human. The merger agent still never resolves a conflict.

- `node scripts/board-scale-integrity.mjs --rules-only` applies the colour, size and variable rules to every board file with no Storybook build and no export checks, and prints one line per board with its counts, for example `ok   05-screens-3.pen   colour 0 · size 0 · exempt 10 · chrome 0 · variables 37`. A failure names the board to open, and a pass shows how many exemptions each board leans on. Both modes now read only the board files, PNGs and tile maps git tracks, so what is checked is what a clean checkout holds. The default mode refuses an untracked board or export that is not gitignored, because turbo's cache hashes it either way and would otherwise replay a pass after `git add`; a scratch board belongs in `.gitignore`. `--rules-only` lists any untracked board it skipped. A tracked board deleted without `git rm`, or one that is not JSON, gets its own line in both modes instead of vanishing or crashing.

- `health:check` fails on a Vitest `describe`, `it`, `test`, `bench` or `suite` call with `.skip`, `.todo`, `.only`, `.skipIf` or `.runIf` (chained forms such as `it.only.each` included) at the start of a line in any unit test the gate runs, naming the file and line. A skipped test is counted and never run, and a `.only` narrows the run, while the suite stays green either way. A `// reason: <text>` comment on the same line or alone on the line above is the one escape: the call is still printed, but it no longer fails the check. A scanned directory with no test file fails it with exit 2, and so does a workspace with a Vitest config whose tests left the scanned directory, so the check cannot go blind.

- A `pnpm sandcastle` run that moved `origin/main` now ends by saying whether `main`'s tree has a gate receipt. It prints `main verified <sha>`, or `main has no receipt <sha>` with the commands that give it one. Each PR is verified on its head, but the commit that lands on `main` has a tree of its own once two branches crossed, and nothing used to report that gap. The run fetches `main` and `refs/notes/*` first, and it only reports: it never runs the gate. When this host's receipts have diverged from origin's, or `--verify` broke, it says the answer is unknown rather than "no receipt", with the commands that join the receipts in the first case.

- The gate refuses to run on a Node whose major.minor differs from `.nvmrc`. It exits 2 before any check, naming both versions and `nvm use`/`fnm use`, so no receipt is written for a runtime the repository does not declare. `pnpm install` now also fails, instead of warning, when a dependency's `engines` excludes the running Node (`engineStrict: true` in `pnpm-workspace.yaml`); the root `engines` floor rises to 22.22.2, the lowest Node jsdom 30 accepts, so the two never disagree.

- build(deps): Storybook 10.5.7 → 10.6.2 and dompurify 3.4.16 → 3.4.17 (through mermaid), which close the open Dependabot alerts: 4 critical, 4 high, 1 low. The `@storybook/nextjs-vite` patch is carried forward to 10.6.2 unchanged, because 10.6.2 still does not set `parentRenderTree` on the router context.

- The pixel perfect session no longer misreads a tile drawn beside a seam on its board. The tile map rounds each frame to whole export pixels, so a dark tile's first column blended into the light half next to it and read as ink on every row. The crop is now sampled one export pixel inside each edge. 24 dark tiles that read as a solid block now match their light twins, and no light reading changed.

- A pixel perfect session starts from the console's shot view, which is its only input:
  `/pixel-perfect-session <URL>` reads that screenshot against its tile by pixel rows. It
  derives the story, its source, the Storybook addresses, the baseline and the board from the
  URL, then fixes the component on-token and stops before accepting. It covers the four
  `packages/ui` tiers and the console's `screens`. The skill lives in
  `.claude/skills/pixel-perfect-session/`, and its page is `Docs/Skills/Pixel Perfect Session`.

- Every console screen now has its tiles: the report, the comparison modal, the set viewer and
  the shot view are drawn on `05-screens` from the hand-drawn pages on `x-visual-diff-pages`,
  each at 1:1 with its baseline and its dark tile a theme of the light one. A report tile is 7841
  px tall on mobile, so `05-screens` is the first board this repository pages:
  `05-screens-1`–`05-screens-4`, each exported at 1× or better, and the console's board picker
  lists the four pages. `designs/undrawn-stories.json` is empty again, and gone.

- Every console page drawn on `x-visual-diff-pages` now has a screen story: the report (one
  story per bucket it holds, `?bucket=changed` and `?bucket=removed`), the comparison modal over
  it, the set viewer and the shot view over it, all on the sample data and held to `fixtures/` by
  a test. The modals are captured one window tall, as a visitor sees them. The screens are titled
  `Screens/Visual-diff-ui/…`, after the app's directory as the children title theirs, so the
  dashboard's four baselines are renamed with no pixel changed. The corpus is 230 baselines at
  7.6 MB, and its budget rises from 5 to 8 MB. Their tiles follow in their own pull request:
  `designs/undrawn-stories.json` lists a story written before it is drawn, the reverse of
  `drawn-ahead-stories.json`, and only shrinks.

- The visual-diff capture matrix has a fifth tier, `screens`: whole pages of the console,
  storied under `apps/visual-diff-ui/app/_screens/` and baselined at both viewports in both
  themes. The set viewer shows them behind a `screens` button after `templates`, and the
  `05-screens` board draws their tiles. The first is the dashboard as a deployment serving the
  sample data draws it, four baselines that keep the corpus at 3.5 MB, inside its 5 MB budget.
  Storybook 10.5's Next.js framework mounts an App Router context that Next 16.4's
  `useRouter()` cannot read, so `@storybook/nextjs-vite` carries a one-line `pnpm patch` until
  upstream catches up.

- The visual-diff capture matrix has a locale axis for listed stories only. A story tagged
  `visual-diff:locales` is captured once per entry in `LOCALES`, and its variant key becomes
  `tier__viewport__theme__locale__id`; every other key keeps its four parts byte for byte, so no
  baseline is renamed. A third sanity gate fails a run whose listed stories come back identical
  across locales. This repository ships English only, so it lists no story: the axis is here for
  the children that translate their UI.

## v1.7.0 — every story has its tile on the board, and the gate holds them to each other

_Released 2026-10-21._

Forty-six PRs since [v1.6.0](https://github.com/climaa/acceptance-gate/releases/tag/v1.6.0) (#517, #554 → #602), telling one story: **every story has its tile on the board, and the gate holds them to each other.**

### What earns the minor

| Layer                                                                                                                                                                                                                                                                                                                                                                             | PRs                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| The design boards are the inventory, built to one standard: one `.pen` per board, the four tier boards draw one tile per story named by its variant key, colours follow the theme, every export carries a sidecar stating the scale drawn, page tiles are drawn from the rendered stories, and a fifth tier board, `05-screens`, is defined for a project that captures its pages | #576, #590, #591, #592, #597, #599, #601, #602       |
| The `boards` check holds that inventory to the tree: every planned story has its tile and every tile a story, read from the board files themselves, with a child skipping the stories its parent draws, and the agents are told a story ships with its tile                                                                                                                       | #594, #595, #596, #598                               |
| The shot view reads a screenshot against its tile: it opens on the story's tile of the board, a pinned crop fills its pane with the screenshot following at one scale, clearing a crop fits the whole board, a variant opens on the board page that draws it, and the title opens the story in Storybook                                                                          | #565, #566, #567, #568, #569, #573, #600             |
| The overlay becomes an instrument: a difference blend to see drift by eye, a choice of which layer the nudge moves, nudges by touch, a grid, a centred stage at its own height, and every one of those settings in the URL                                                                                                                                                        | #558, #559, #560, #561, #577, #578                   |
| The console's states are links, and its pages tidy their own house: a filtered set and a compare pair are addresses, a report is deleted from its own page, reports list in run order, a clean run draws no review controls, and the sets table keeps room for the label                                                                                                          | #557, #562, #563, #564, #571, #572, #574, #579, #584 |
| The gate runs on your machine: `.husky/pre-push` runs `pnpm gate` before every push, the per-PR workflows are off, and `RELEASING.md` ships by the `production` ref move alone                                                                                                                                                                                                    | #554, #580, #581, #582                               |
| `CHANGELOG.md` is the changelog's source, and this body is copied from it                                                                                                                                                                                                                                                                                                         | #556                                                 |
| Turbo's cache keys on the committed design boards wherever a task reads them: the console's tests and Storybook's build                                                                                                                                                                                                                                                           | #585, #593                                           |
| The differ measures colour distance with pixelmatch 8 (OKLab with HyAB, not YIQ), and no baseline had to be accepted again                                                                                                                                                                                                                                                        | #517, #555                                           |
| The owner's own page views can be opted out of analytics with `?va-disable=1`                                                                                                                                                                                                                                                                                                     | #570                                                 |
| The blog: _the merge that passed every check and did not ship_                                                                                                                                                                                                                                                                                                                    | #575                                                 |
| Dependencies: mermaid 12.2.0 for katex 0.18, and handlebars 4.7.10 by the repository's first `pnpm` override                                                                                                                                                                                                                                                                      | #583                                                 |

v1.6.0 put the design board beside the screenshot. This cycle made the board something that can be wrong. Each story is drawn once, as a tile named by the same variant key as its screenshot, and the `boards` check fails when a story has no tile or a tile has no story. The shot view and the overlay are the reading side of that contract: they open on the tile, not on the whole board, and everything they show can be sent as a link. A tile is still reference beside a comparison. It is never a side of one and never carries a bucket.

The gate moved in the same cycle, for a reason that has nothing to do with design. Actions minutes ran out, so the checks `pr.yml` ran now run in a `pre-push` hook from one list in `scripts/gate/manifest.mjs`. Nothing that was gated before goes ungated, but a hook can be skipped where a required check could not. That is named below rather than smoothed over.

### Eleven manifests

The same eleven as v1.6.0 move to 1.7.0 together. Nothing publishes to npm and every workspace is private, so the version is a coherence marker rather than a distribution fact. Every internal dependency is `workspace:*`, and `pnpm install --frozen-lockfile` resolves with `pnpm-lock.yaml` untouched, verified rather than assumed.

### The index, measured rather than adjusted

`PROJECT_INDEX.md` was stamped 2026-10-18. Every count was measured again with the turbo cache forced off (0 of 8 test tasks cached):

| Claim                                          | Corrected to                                                                                                                               |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Orchestrator suite 41 files / 680 tests        | **43 / 706**                                                                                                                               |
| `packages/ui` 38 / 630                         | **38 / 634**                                                                                                                               |
| `apps/blog` 28 / 563 (560 passed, 3 skipped)   | **28 / 576** (573 passed, 3 skipped)                                                                                                       |
| `apps/storybook` 7 / 200                       | **7 / 235**                                                                                                                                |
| `apps/visual-diff-ui` 74 / 1242 (1 skipped)    | **76 / 1312** (none skipped)                                                                                                               |
| `apps/manual` 10 / 117                         | **10 / 118**                                                                                                                               |
| `packages/logger` 2 / 20                       | **3 / 32**                                                                                                                                 |
| CI: `pr.yml`'s `gate`, the only required check | **`pnpm gate` from `.husky/pre-push`**; the applied ruleset requires no check, and the committed `rulesets/main.json` no longer matches it |
| README: four exported boards                   | **nine**                                                                                                                                   |

The structure tree now describes the shot view opening on a tile, the overlay's link and the report's own delete, and lists `scripts/gate/`. Unchanged, and measured: `packages/visual-diff` 11 / 458, `packages/links` 1 / 10, 87 acceptance scenarios (162 tests), the two-scenario local lane, 29 stories, 19 docs pages, 27 orchestrator modules, `next` ^16.4.0 and `turbo` ^2.11.7. The committed baselines went from 200 to 204 with #571, and `index-integrity` held the index to that count when it landed.

### Known gaps

**The gate is a hook, not a check.** Every workflow is disabled and `main` requires no status check. A push with `--no-verify`, or from a fresh worktree before `pnpm install` has installed the hook, reaches `main` ungated.

**The README still tells the Actions story.** Its `pr` badge, its pipeline diagram and its loop section describe `pr.yml`'s `gate` and `gate.needs`. This release corrected the counts; rewriting that narrative is its own change.

**Publishing does not refresh `/changelog` by itself.** `changelog-deploy.yml` is disabled with the rest, so each release session rebuilds the blog by hand or accepts a stale page, as `RELEASING.md` describes.

**The ledger still reads spacing only.** Colour, type and radius are not measured.

**Upstream and unchanged:** [#68](https://github.com/climaa/acceptance-gate/issues/68) ESLint 10 is unreachable, and [#47](https://github.com/climaa/acceptance-gate/issues/47) TypeScript 7 is blocked. Dependabot ignores both majors on purpose.

**Full changelog:** https://github.com/climaa/acceptance-gate/compare/v1.6.0...v1.7.0

## v1.6.0 — a screenshot is read against its design board, down to the design token

_Released 2026-10-18._

Sixty-five PRs since [v1.5.0](https://github.com/climaa/acceptance-gate/releases/tag/v1.5.0) (#469 → #552), telling one story: **a screenshot is read against its design board, down to the design token.**

### What earns the minor

| Layer                                                                                                                                                                                                                                                                         | PRs                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| A comparison is a link you can send, and opens beside the design board it was drawn from                                                                                                                                                                                      | #500, #502, #503                                                             |
| The token ledger: every console capture records the spacing it measured, each value classified against the design-token scale, and the design view lists those readings in design-token terms — a focused reading lights its box, and a report records which readings changed | #506, #507, #510, #515, #522, #523, #527, #528, #530, #532, #534, #535, #536 |
| The shot view: a screenshot in a set opens beside its design board, and PanZoom learns to draw marks, follow another view, take a crop, and magnify past an image's own pixels                                                                                                | #525, #541, #542, #543, #544, #545, #546, #548, #549                         |
| The boards drew each of those before the code did: PanZoom's marks, the design view's readings, the set shot view and decision D7                                                                                                                                             | #524, #526, #537                                                             |
| The blog's index is paged four posts at a time, each page at its own address, through a new Pagination molecule that speaks the caller's language                                                                                                                             | #485, #486, #487, #488, #491, #492, #494                                     |
| Every page on all four surfaces previews as itself — its own card, its own canonical address                                                                                                                                                                                  | #493, #495, #496, #511, #512, #513                                           |
| The console: compare A ⇄ B starts the comparison, set-row badges sit under the values they qualify, run parameters open folded, and the sample console shows the corpus's latest movement                                                                                     | #480, #482, #501, #514                                                       |
| The footer ends its copyright line with the release it was built from                                                                                                                                                                                                         | #483                                                                         |
| Production ships from a `production` branch, and since #552 no other branch creates a deployment                                                                                                                                                                              | #518, #519, #550, #552                                                       |
| A capture never reads a Storybook build older than the components; a bucket-count scenario that could never fail is gone                                                                                                                                                      | #477, #478, #551                                                             |
| Sandcastle: the merger runs on Sonnet 5.5 and merges a CLEAN PR whose auto-merge never armed; sandbox git setup waits 60 s; turbo's cache lives in `/tmp` for the whole sandbox                                                                                               | #474, #475, #476, #479                                                       |
| The index lists the child projects that carry copies of the shared tooling                                                                                                                                                                                                    | #481                                                                         |
| Dependencies, among them Sentry 10 → 11, Storybook's warnings under Vite 8.3.1, and the vulnerable transitives that fit their ranges                                                                                                                                          | #469, #470, #471, #472, #473, #484, #516                                     |

The two big threads answer one question: when a screenshot moved, did it move toward the design or away from it? A pixel diff says only that something changed. The design board says what the screenshot was meant to look like, and the token ledger says whether the spacing it measured is a step of the scale or an off-scale value. Neither of them is a side of a comparison or carries a bucket. The differ still detects change rather than correctness, and the ledger is reference beside it. #523 renamed a reading's verdict to a classification so that the code stopped implying otherwise.

The deploy rows are the cost side of the same cycle. Building production on every merge took the Hobby plan's deployment storage to 75% in a fortnight, and preview builds spent its daily cap. #518 moved production to its own branch and #550 opted every other branch out in `vercel.json`. That opt-out held in the private child projects but not here: pushes to this public repository still created a deployment per project. #552 turned Git deployments off on all four projects. Its own push and merge created none, and moving `production` still deploys, as this release did.

### Eleven manifests

The same eleven as v1.5.0 move to 1.6.0 together. Nothing publishes to npm and every workspace is private, so the version is a coherence marker rather than a distribution fact. Every internal dependency is `workspace:*`, and `pnpm install --frozen-lockfile` resolves with `pnpm-lock.yaml` untouched, verified rather than assumed.

### The index, measured rather than adjusted

`PROJECT_INDEX.md` was stamped 2026-09-26. Every count was measured again with the turbo cache forced off (0 of 8 test tasks cached):

| Claim                                                                       | Corrected to                                                                      |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Orchestrator suite 39 files / 656 tests                                     | **41 / 680**                                                                      |
| `packages/ui` 35 / 512, 28 components (16 · 6 · 4 · 2)                      | **38 / 630**, **30** components (16 atoms, 7 molecules, 5 organisms, 2 templates) |
| `apps/blog` 26 / 514 (511 passed, 3 skipped)                                | **28 / 563** (560 passed, 3 skipped)                                              |
| `packages/visual-diff` 10 / 327                                             | **11 / 458**                                                                      |
| `apps/storybook` 6 / 186                                                    | **7 / 200**                                                                       |
| `apps/visual-diff-ui` 56 / 938                                              | **74 / 1242** (1 skipped)                                                         |
| `apps/manual` 7 / 92                                                        | **10 / 117**                                                                      |
| 53 acceptance scenarios                                                     | **87** (162 tests)                                                                |
| 27 stories                                                                  | **29**                                                                            |
| `next` ^16.3.5, `turbo` ^2.11.2 (and ^2.10.11 in the configuration section) | **^16.4.0**, **^2.11.7** in both                                                  |

The structure tree also lacked this cycle's features: the console's comparison links, design-board reading and shot view, the differ's token ledger, and the blog's paged index. It now describes them, and README's component row moved from 28 to 30. Unchanged, and measured: `packages/logger` 2 / 20, `packages/links` 1 / 10, the two-scenario local lane, 200 committed baselines, 19 docs pages and 27 orchestrator modules.

### Known gaps

**The ledger reads spacing only.** Colour, type and radius are not measured. It is reference beside a comparison and never decides a bucket or an exit code, so a capture full of off-scale values still passes.

**The pixelmatch 7 → 8 bump waits.** [#517](https://github.com/climaa/acceptance-gate/pull/517) is a major version of the differ's comparison library, so it can move pixel results. It needs a session that reviews the baselines rather than an auto-merge.

**The Git setting does less, and more, than its name says.** With `createDeployments` disabled, a push to any branch but `production` creates nothing, yet a move of `production` still deploys. #552 assumed the opposite and added a deploy-hook step to `RELEASING.md`. Shipping this release fired both, so each project built twice. The hook step is being removed, and the blog keeps its hook only for the `/changelog` refresh.

**Upstream and unchanged:** [#68](https://github.com/climaa/acceptance-gate/issues/68) ESLint 10 is unreachable, and [#47](https://github.com/climaa/acceptance-gate/issues/47) TypeScript 7 is blocked. Dependabot ignores both majors on purpose.

**Full changelog:** https://github.com/climaa/acceptance-gate/compare/v1.5.0...v1.6.0

## v1.5.0 — the console works from a phone on a bad connection

_Released 2026-09-26._

Fifteen PRs since [v1.4.0](https://github.com/climaa/acceptance-gate/releases/tag/v1.4.0) (#453 → #467), telling one story: **the console works from a phone on a bad connection, and says more before you open anything.**

### What earns the minor

| Layer                                                                                                                                                                       | PRs                    |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Every browser request from the console gives up after 30 seconds, so a stalled confirm says so instead of spinning, and a stalled poll no longer stops the job log for good | #465                   |
| A report row carries its bucket chips, and each chip opens the report already filtered to that bucket                                                                       | #466                   |
| A set that repeats an older set's sha is marked `same sha`, so a second capture of one commit reads as a repeat rather than as a change                                     | #467                   |
| The manual puts its way in above the prose, and gains a five-step tour that links into the console instead of photographing it                                              | #458, #459             |
| The published Storybook counts its readers, the fourth surface to do so                                                                                                     | #457                   |
| Links between the five surfaces say where they came from                                                                                                                    | #461                   |
| `PROJECT_INDEX.md` is held to the repository by a gate, and the release standard is written down as `RELEASING.md`                                                          | #453, #454             |
| The dialog story stops photographing the browser's own button                                                                                                               | #460                   |
| The Sandcastle judgment roles run on Opus 5.5 at medium effort                                                                                                              | #462                   |
| Dependencies, among them mermaid 11 → 12 and dotenv 17 → 18                                                                                                                 | #455, #456, #463, #464 |

The three console PRs came from using it where it had never been used. Opened on a phone over a VPN from a train, the console hung on the first dropped packet. `fetch` has no timeout of its own, so a delete neither landed nor failed, and the job poller, which schedules its next poll only once the current one returns, stopped for good on a single stalled request. Thirty seconds is generous on purpose: a limit tight enough to be felt on a good connection would fail requests that were only slow. The chips and the badge answer the same reader. A phone makes every opened report a round trip, so the dashboard now says what each comparison found and which sets are the same commit twice.

#464 is a dependency bump that would have broken every local build. dotenv 18 ships its own `dotenv` command, and it replaced dotenv-cli's under the same name. Every root script that wraps turbo then exited 1 with dotenv's usage message. CI stayed green, because its jobs call `pnpm turbo run` directly and never go through those scripts. The PR moved the scripts to `dotenv run -q --override --` and removed dotenv-cli before it merged.

### Eleven manifests, not ten

`packages/links` is new this cycle. #461 added it to hold `tagOutbound` and the list of sources it tags a link with, so the eleven manifests move together. Nothing publishes to npm and every workspace is private, so the version is a coherence marker rather than a distribution fact. Every internal dependency is `workspace:*`, and `pnpm install --frozen-lockfile` resolves with `pnpm-lock.yaml` untouched, verified rather than assumed.

### The index, measured rather than adjusted

`PROJECT_INDEX.md` was stamped 2026-09-14. Every count was measured again with the turbo cache forced off:

| Claim                                                  | Corrected to                                                  |
| ------------------------------------------------------ | ------------------------------------------------------------- |
| Orchestrator suite 39 files / 654 tests                | 39 / **656**                                                  |
| `apps/visual-diff-ui` 56 / 928                         | 56 / **938**                                                  |
| `next` ^16.3.2 / `react` ^19.2.8, "blog and storybook" | **^16.3.5 / ^19.3.0**, used by the console and the manual too |
| `turbo` ^2.10.11                                       | **^2.11.2**                                                   |
| No mention of dotenv                                   | **dotenv 18**, whose own CLI wraps every root turbo script    |

The console's entry in the structure tree and README's status row also lacked this release's three console changes, and now describe them. Unchanged, and measured: `packages/ui` 35 / 512, `apps/blog` 26 / 514 (511 passed, 3 skipped), `packages/visual-diff` 10 / 327, `apps/storybook` 6 / 186, `packages/logger` 2 / 20, `apps/manual` 7 / 92, `packages/links` 1 / 10, 53 acceptance scenarios and the two-scenario local lane, 160 committed baselines, 28 components in four tiers, 27 stories and 19 docs pages.

### Known gaps

**The changelog is showing its unavailable note.** `changelog-check` failed on 2026-09-26: the deployed `/changelog` says the releases could not be loaded when the page was built. `changelog-deploy` has still never run green, so publishing this release cannot count on the blog rebuilding to show it. The build-time fetch, or the credential it uses, is the fault to find next.

**The board and the code disagree on one chip.** Board 04 draws `changed` in the danger tone, and the console draws it in the accent tone. This predates this release, and #466 followed the board rather than choosing between them.

**Jobs from another device go through a proxy outside this repository.** The console's localhost guard is unchanged and still refuses a job whose `Host` is not loopback. Running jobs from a phone on the LAN or a VPN works through a small proxy on the machine that runs the console, which this repository does not ship.

**Upstream and unchanged:** [#68](https://github.com/climaa/acceptance-gate/issues/68) ESLint 10 is unreachable, and [#47](https://github.com/climaa/acceptance-gate/issues/47) TypeScript 7 is blocked. Dependabot ignores both majors on purpose.

**Full changelog:** https://github.com/climaa/acceptance-gate/compare/v1.4.0...v1.5.0

## v1.4.0 — the screenshot corpus can be looked at, not only compared

_Released 2026-09-12._

Eighteen PRs since [v1.3.0](https://github.com/climaa/acceptance-gate/releases/tag/v1.3.0) (#429 → #451), telling one story: **the screenshot corpus can be looked at, not only compared.**

### What earns the minor

| Layer                                                                                                               | PRs                    |
| ------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| The set viewer — `/set/[label]`, every screenshot grouped by the story it belongs to, under its tier                | #448                   |
| A sample set that ships its shots, so the deployed console has one to open                                          | #449                   |
| A pinned filter bar over it — theme and viewport, each strip leading with `auto`                                    | #450                   |
| The releases get read on the blog, not only on github.com                                                           | #429                   |
| Each release opens its own conversation                                                                             | #430                   |
| `/changelog` says what the repository **is** before the first version                                               | #435                   |
| `/about` points at the portfolio three times, as a link and never a redirect                                        | #451                   |
| A post slug shape-checked before it reaches the filesystem                                                          | #438                   |
| The local console asks who a mutation came from                                                                     | #436                   |
| The wand glyph pinned to the story the differ photographs                                                           | #437                   |
| A wide table scrolls itself instead of the page                                                                     | #443                   |
| The four apps live on carloslima.dev, so the repo says so                                                           | #447                   |
| Two posts — the board as the part of a spec an agent cannot infer, and why GitHub bills jobs rather than wall clock | #441, #442             |
| Dependencies, the last of them vitest 4 → 5 across every workspace                                                  | #439, #440, #444, #445 |

This repository has photographed its design system since 1.0.0 and offered no way to look at the photographs. You could compare two screenshot sets and read the verdict; you could not open a set and see what was in it — which is a strange gap in a repo whose subject is its own evidence. The viewer draws each shot at its own ratio and never upscales or crops it, so a 12px-tall atom reads as a shot rather than as a gap in the layout: the pixels are the evidence, and resizing them to look tidy would be editing the evidence. [#449](https://github.com/climaa/acceptance-gate/pull/449) matters more than its one line suggests — a route that only works on a checkout is a route most readers never see. And 160 screenshots across 63 stories is long enough that the tier nav scrolled away, so a reviewer checking dark contrast read the 80 they did not want in order to reach the 80 they did; [#450](https://github.com/climaa/acceptance-gate/pull/450)'s filters are native radios read through `:has()`, so the page carries 160 images and still hydrates nothing.

### Ten manifests, still ten

No new workspace this cycle — the first release since 1.1.0 that adds none. The reason for lockstep is the one 1.0.0 stated and every release since has kept: nothing publishes to npm, every workspace is private, so the version is a coherence marker rather than a distribution fact. Every internal dependency is `workspace:*`, so `pnpm-lock.yaml` is unaffected and `--frozen-lockfile` still resolves — verified rather than assumed.

### The index, measured rather than adjusted

`PROJECT_INDEX.md` was stamped 2026-08-31 and had drifted in both directions and by omission:

| Claim                            | Corrected to                                                                                  |
| -------------------------------- | --------------------------------------------------------------------------------------------- |
| `apps/blog` 18 files / 378 tests | **26** / **513** (510 passed, 3 skipped)                                                      |
| `apps/visual-diff-ui` 53 / 829   | **56** / **928**                                                                              |
| `apps/storybook` 5 / 128         | 5 / **131**                                                                                   |
| 44 acceptance scenarios          | **53** (`EXPECTED_SCENARIOS`)                                                                 |
| 158 committed baselines          | **160**                                                                                       |
| `packages/ui` 26 stories         | **27** — which the index's own "every one storied but Stack" already implied of 28 components |
| `build.env` is two variables     | **four**; #429 added `BLOG_RELEASES_FIXTURE` and `GITHUB_TOKEN`                               |

The structure tree had also lost three of this release's own routes: `/changelog`, `/set/[label]`, and both changelog workflows. Unchanged, and verified rather than assumed: the orchestrator's own suite (39 / 654), `packages/ui` (35 / 512), `packages/visual-diff` (10 / 327), `packages/logger` (2 / 20), `apps/manual` (6 / 69), the two-scenario local lane, 28 components in four tiers, 19 Storybook docs pages.

These corrections landed in [#453](https://github.com/climaa/acceptance-gate/pull/453), after this tag rather than with it — which is the first of the gaps below.

### Known gaps

**This release was cut without its index audit, and these notes were first published without their shape.** The body was the release commit's message pasted whole — no thesis, no table, no corrections, no gaps — which made it the only entry on `/changelog` rendering as an unbroken wall, on a page whose own post says every release since 1.0.0 has the same four parts. The cause was that the standard lived only in that post and nowhere in the repository, so nothing went red when the release PR bumped ten manifests and stopped. [#453](https://github.com/climaa/acceptance-gate/pull/453) writes it down as `RELEASING.md`, carries the index and README refresh that belonged here, and rewrote this body.

**`changelog-deploy` has never run green.** Its `BLOG_DEPLOY_HOOK_URL` secret is stored empty, so publishing this tag could not ask the blog to rebuild — the one edge that puts a release on the site failed silently at the moment it was needed. The workflow anticipated a skipped build and a replayed cache, and polls the live page rather than trusting the API for exactly that reason; what it did not anticipate was an empty credential that reads as set.

**Upstream and unchanged:** [#68](https://github.com/climaa/acceptance-gate/issues/68) ESLint 10 is unreachable, [#47](https://github.com/climaa/acceptance-gate/issues/47) TypeScript 7 is blocked. Dependabot ignores both majors on purpose.

**Full changelog:** https://github.com/climaa/acceptance-gate/compare/v1.3.0...v1.4.0

## v1.3.0 — the console gets a manual, generated from what it already tests

_Released 2026-08-31._

Seventeen PRs since [v1.2.0](https://github.com/climaa/acceptance-gate/releases/tag/v1.2.0) (#409 → #427), telling one story: **the visual-diff console now has an end-user manual, and it cannot drift from what it describes.**

### What earns the minor

| Layer                                                                                                                        | PRs              |
| ---------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `@gate/manual` — three pages (console, report, sample) parsed at build time from the acceptance suite's own `.feature` files | #414             |
| The step renderer, drawn on the board first                                                                                  | #415, #416       |
| `StepList` promoted to a `packages/ui` molecule, shared by the manual and the console                                        | #417             |
| "snapshot" retired from both surfaces' own words                                                                             | #413, #418       |
| Wired to its deployed origin, linked from the console, a stable `Thumbnail` before images arrive                             | #419, #420, #421 |
| Page views counted on the same terms as the blog and the console                                                             | #423, #424       |
| The glossary, and why a cached test cannot answer for the confinement guard                                                  | #409, #412       |
| A UI fix — `ds-table`'s card layout                                                                                          | #410             |
| `apps/blog` gets a `robots.txt` naming its sitemap                                                                           | #425             |
| `report.html` retired — the console renders every report itself now                                                          | #426             |
| Phase 5 board item: the console says what a run is, what A/B mean, and what a verdict means                                  | #427             |

The deployed console's sample mode was already a real demo — PR [#242](https://github.com/climaa/acceptance-gate/pull/242)'s regression, seen backwards through the differ. What #427 actually closed was three sentences of narration, plus a worked overlap/margin example and a link to one representative Sandcastle-authored PR ([#426](https://github.com/climaa/acceptance-gate/pull/426)) in the README, as the evidence the README had promised without pointing at an instance of it.

### Ten manifests, not nine

`apps/manual` is new this cycle. The reason for lockstep is the one 1.0.0 stated and every release since has kept: nothing publishes to npm, every workspace is private, so the version is a coherence marker rather than a distribution fact. Every internal dependency is `workspace:*`, so `pnpm-lock.yaml` is unaffected and `--frozen-lockfile` still resolves.

### The index, measured rather than adjusted

`PROJECT_INDEX.md` was stamped 2026-08-28 and had already drifted, in both directions and by omission:

| Claim                                   | Corrected to                                                     |
| --------------------------------------- | ---------------------------------------------------------------- |
| `apps/manual`                           | missing entirely → **6 files / 69 tests**, three published pages |
| `packages/ui` 34 / 492, 27 components   | 35 / **512**, **28** components (`StepList`, the sixth molecule) |
| `apps/blog` 18 / 371                    | 18 / **378** (375 passed, 3 skipped)                             |
| `packages/visual-diff` 11 / 334         | **10 / 327** (`report-html.mjs` and its test file are gone)      |
| `apps/storybook` 5 / 125, 18 docs pages | 5 / **128**, **19** docs pages                                   |

`apps/visual-diff-ui` (53/829) and the orchestrator's own suite (39/654) had not drifted. README's own status table carried the same omission — no `apps/manual` row — corrected alongside it.

### One known gap, carried forward rather than hidden

Phase 5's design-board update did not land this cycle: the pencil MCP could not see an open file this session, so `designs/acceptance-gate.pen`'s Board 04 was not updated before the console copy in #427. Reconciling the board with that copy is a follow-up.

**Full changelog:** https://github.com/climaa/acceptance-gate/compare/v1.2.0...v1.3.0

## v1.2.0 — the apps report their own errors

_Released 2026-08-28._

Ten PRs since [v1.1.0](https://github.com/climaa/acceptance-gate/releases/tag/v1.1.0) (#394 → #407), telling one story: **both apps went from swallowing production errors to reporting them.**

### What earns the minor

| Layer                                                                                    | PRs              |
| ---------------------------------------------------------------------------------------- | ---------------- |
| The error boundaries neither app had                                                     | #400             |
| `@gate/logger` — silent in production, `error()` always forwards to a pluggable reporter | #402             |
| The boundaries become its first call sites                                               | #405             |
| The Bugsink adapter behind `@gate/logger/bugsink`                                        | #406             |
| Page views on the production deployment only                                             | #394, #397, #398 |
| The 404 a streamed cache miss cannot set                                                 | #399             |
| `next-env.d.ts` untracked                                                                | #401             |
| The written half — the post, plus Error Tracking / Logging / Web Analytics               | #407             |

The tracker is **live, not dormant**: the DSN lives in Vercel's project settings, and `.env.example` ships both variables empty on purpose, so local runs, CI and the sandbox stay indifferent to the wiring. The story is written up in [The research said GlitchTip. The decision was Bugsink.](https://acceptance-gate-blog.vercel.app/blog/the-research-said-glitchtip), with the runbook in [Error Tracking](https://acceptance-gate-storybook.vercel.app/index.html?path=/docs/docs-devops-error-tracking--docs).

### Nine manifests, not eight

`packages/logger` is new this cycle. The reason for lockstep is the one 1.0.0 stated: nothing publishes to npm, every workspace is private, so the version is a coherence marker rather than a distribution fact. Every internal dependency is `workspace:*`, so `pnpm-lock.yaml` is unaffected and `--frozen-lockfile` still resolves.

### The one code change: `.fallow/churn.bin` untracked

Cutting the tag is what made the case for it. It is fallow's churn cache, rewritten as a side effect of `fallow health` — which is **`pnpm health:check`, one of the eight required gate jobs**. The tracked copy was therefore dirtied by every local gate run and by every agent that ran the gate before staging, and it entered the history as a side effect of PRs about something else. Two of those raced in #405/#406: the first merged, the second went `CONFLICTING` with auto-merge armed and stranded after the orchestrator had exited, and a binary conflict needs a human.

Nothing reads the committed copy — every run regenerates it from git history — so, exactly as with `next-env.d.ts` in #401, there was no correct value to commit.

### The index, measured rather than adjusted

| Claim                          | Corrected to                                 |
| ------------------------------ | -------------------------------------------- |
| `apps/blog` 18 / 359           | 18 / **371** (3 skipped, one per draft post) |
| `apps/visual-diff-ui` 53 / 825 | 53 / **829**                                 |
| `apps/storybook` 5 / 121       | 5 / **125**                                  |
| 42 acceptance scenarios        | **44**                                       |
| a one-scenario local lane      | **2**                                        |
| Storybook 16 docs pages        | **18**                                       |

`EXPECTED_SCENARIOS` and `EXPECTED_LOCAL_SCENARIOS` already said 44 and 2 — the same drift as last release, so both lines now name the constant that has to agree.

**Full changelog:** https://github.com/climaa/acceptance-gate/compare/v1.1.0...v1.2.0

## v1.1.0 — the visual-diff console is stable

_Released 2026-08-27._

**The console is the product now.** v1.0.0 drew a line under the MVP — the design system, the blog, the Storybook, the acceptance suite, the differ and the orchestrator. This tag is about the surface that reviews what the differ produces: `apps/visual-diff-ui` has taken 65 of the 93 commits since, and it has stopped moving.

Nothing here publishes to npm — every workspace is still `private: true` — so the version remains a coherence marker rather than a distribution fact. All eight manifests carry 1.1.0, not eight numbers that drift.

### What changed

**[The visual-diff console](https://acceptance-gate-visual-diff-ui.vercel.app).** 17 `feat`, 20 `fix`, 10 `refactor`. The job system grew a lock, a streaming log, a dismissable current job and guarded mutations; the report grew tier sections, a review loop, an accessibility treatment that leads rather than trails, and a three-up viewer behind a comparison modal. Client-side JSON now parses against the same zod schemas the server answers with (#385), the four routes share one mutation guard and one containment check instead of four apiece (#358, #359), and the compare ask carries a counter so a repeat press from another tab still lands (#389).

**The accept tab is gone** (#356). It spawned `promote`, which writes a gitignored `__baselines__` that no CI job reads — a review gesture that looked like it accepted a baseline and accepted nothing. Accepting now happens where it always really happened: the `accept-baselines` workflow a person dispatches, or `accept` in the pinned container. `ModeTabs` is two modes, `capture` and `compare`, and says why in its own header.

**The accept loop closed** (#330) — the Docker wrapper, `accept-baselines.yml` and the nightly determinism job that `compare.mjs`'s `STRICT_ENV` was built for. That was the last of Wave 4's tail.

**`packages/ui` gained the eight components the console needed** — TriStateCheckbox, SegmentedControl, BucketChip, Thumbnail, Dialog with its bottom-sheet variant, Table, and the rest — taking the system to 27 in four tiers, still token-only, still layered by `eslint-plugin-boundaries`.

### By the numbers

- **150 test files / 2,690 tests** — 790 console, 654 orchestrator, 490 ui, 334 visual-diff, 307 blog, 115 storybook
- **42 Gherkin scenarios** blocking in `gate.needs`, plus a one-scenario local lane that never runs in CI
- **158 committed visual baselines**, up from 106, still captured in a pinned container
- **72 of the 94 commits** since v1.0.0 carry a model co-author trailer — 236 of 284 all-time
- 94 pull requests merged, 32 issues closed

### The tag found its own bug

The first CI run of the release PR went red on a diff of version strings and markdown. `GET /api/env` reached `dockerAvailable()`, which blocks on `docker info` for up to three seconds, inside a unit suite whose timeout is five — latent since the endpoint was written, invisible on any laptop with a daemon running, and three of that block's four tests were equally exposed. `lib/docker.ts` had already declared the seam that prevents it; the suite had never set it (#396).

It is in these notes rather than quietly squashed into them because it is the argument this repo makes: a gate that only ever runs where the author sits is not a gate.

### Known issues

Both are upstream, both are labelled and blocked, and neither has a workaround worth taking:

- **[#68](https://github.com/climaa/acceptance-gate/issues/68)** — ESLint 10 is unreachable: `eslint-config-next@16` breaks on it, two blockers deep.
- **[#47](https://github.com/climaa/acceptance-gate/issues/47)** — TypeScript 7 blocked: Next cannot resolve tsconfig paths under the native compiler.

[#264](https://github.com/climaa/acceptance-gate/issues/264), the orchestrator's zero-diff-PR bug that led v1.0.0's known issues, is closed.

### What's next

The [project board](https://github.com/users/climaa/projects/1) is still the live, story-pointed roadmap. Wave 5's remaining work is three items, all verified still open at this tag rather than assumed: `ds-table`'s card layout has not taken #302's measured `auto-fit` grid, the runner suite's confinement guard can still be answered by a turbo cache replay, and `.fallow/churn.bin` is tracked with nothing ignoring it.

## v1.0.0 — the MVP is complete

_Released 2026-08-14._

**The MVP is complete.** Every piece the repo set out to build is in and running against
itself: the design system, the blog that consumes it, the Storybook that publishes it, the
acceptance suite, the visual differ, and the autonomous orchestrator that merges work
through all of them. This tag is the line under that.

Work continues in public — the [project board](https://github.com/users/climaa/projects/1)
is the live, story-pointed roadmap, and the place to watch what happens next.

First tagged release. Nothing here publishes to npm — every workspace is `private: true`,
so the version is a coherence marker rather than a distribution fact: the repo is the
product, and it carries one version across all seven manifests.

### What this is

A public portfolio monorepo where every pull request — including the ones that build the
repo itself — walks through the same gate:

```text
lint · typecheck · build · test · format · health · sandcastle · e2e  (parallel)  →  gate
```

`gate` is the only required status check, so a new job joins `gate.needs` rather than
anyone editing branch protection. The ruleset itself is committed as JSON
(`.github/rulesets/main.json`): PR required, squash-only, no bypass actors.

`visual-diff` is the one deliberate exception. It runs on every PR, posts a sticky report
comment, and fails its own job loudly on a real diff — but it never joins `gate.needs`. A
numeric pixel threshold stops being a safety net once change volume is high, and approving
a baseline has to cost the same as reviewing a code diff: a person, in the PR.

### What's in it

| Surface                                                   |                                                                                                                                                                                                  |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`.sandcastle/`](.sandcastle/)                            | The autonomous orchestrator — plans, implements in a Docker sandbox, reviews with a second agent, opens a PR, squash-merges once `gate` is green. 27 modules, guarded by its own hermetic suite. |
| [blog](https://acceptance-gate-blog.vercel.app)           | Next.js 16 App Router + MDX — posts, tags, RSS, sitemap, OG images, Cache Components and Partial Prefetching enabled.                                                                            |
| [Storybook](https://acceptance-gate-storybook.vercel.app) | Every component rendered in isolation, plus the docs pages that describe the system: System Design, Atomic Design, QA, DevOps, Skills.                                                           |
| `packages/ui`                                             | The design system — all 19 components of the normative inventory in four tiers, token-only styling, layering enforced by `eslint-plugin-boundaries`.                                             |
| `packages/visual-diff`                                    | The self-built visual-regression CLI: Playwright capture, pixelmatch compare, axe scan per shot, self-contained HTML report. No SaaS.                                                            |
| `apps/e2e`                                                | playwright-bdd acceptance suite. `.feature` files are product requirements and are never edited to make a test pass.                                                                             |

### By the numbers

- **86 test files / 1,613 tests** — 629 orchestrator, 308 ui, 286 blog, 291 visual-diff, 99 storybook
- **9 Gherkin scenarios** across smoke, blog and axe accessibility, blocking in `gate.needs`
- **106 committed visual baselines**, captured in a pinned container so a font-hinting
  difference between a laptop and CI can never read as a UI change
- **163 of 189 commits** on `main` carry a model co-author trailer
- 161 merged pull requests, 91 closed issues

### Known issues

- **[#264](https://github.com/climaa/acceptance-gate/issues/264)** — the orchestrator's
  merge phase can open a zero-diff PR that still carries `Closes #<ID>`, which auto-closed
  a still-blocked issue once. The `sandcastle-noop-issues` protection exists at
  classification time but is bypassed once a branch reaches the merge prompt with a real
  PR. Open, labelled `bug`, and queued as the first work after this tag.

### What's next

The [project board](https://github.com/users/climaa/projects/1) carries the roadmap past
this tag — Backlog → In Progress → Done, story-pointed, burn-up per wave. It is a window
onto the pipeline, never a control surface: the work still arrives as issues, and the
issues still walk the gate.

### Not in scope yet

TypeScript 7 ([#47](https://github.com/climaa/acceptance-gate/issues/47)) and ESLint 10
([#68](https://github.com/climaa/acceptance-gate/issues/68)) are both blocked upstream and
tracked as such — Dependabot ignores those majors on purpose rather than opening a PR that
cannot pass.
