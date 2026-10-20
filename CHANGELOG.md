# Changelog

Every release of `acceptance-gate`, newest first. This file is the source: at each release
session the `Unreleased` section is written up, moved under its version, and the GitHub
Release body is copied from it — never written separately. The versions below were
transcribed from the GitHub Releases that existed when this file was created (2026-10-18).

## Unreleased

Merged to `main` since v1.6.0, not yet released:

- docs(releasing): ship by the ref move alone — production still deploys with Git off (#554)
- build(deps): bump pixelmatch from 7.2.0 to 8.0.0 (#517)
- docs(visual-diff): pixelmatch 8 measures in OKLab with HyAB, not YIQ (#555)
- docs: CHANGELOG.md is the changelog's source, and the release body is copied from it (#556)
- fix(visual-diff-ui): the filter bar's tier links put their key before the spread (#557)
- fix(visual-diff-ui): the shot view's overlay sits centred in its pane, as Board 04 draws it (#558)
- feat(visual-diff-ui): the overlay chooses which layer the nudge moves, and nudges by touch (#559)
- fix(visual-diff-ui): the grid toggle draws a grid on the overlay too (#560)
- feat(visual-diff-ui): a difference blend on the overlay, to see the drift by eye (#561)
- fix(visual-diff-ui): reports list in run order, durations under a second say so, and the label placeholder stops looking like a date (#562)
- fix(visual-diff-ui): a report names the canonical corpus, and a clean run draws no review controls (#563)
- fix(visual-diff-ui): the sets table gives the label the room, so two sets of one day read apart (#564)
- fix(visual-diff-ui): the crop toggle stays beside a pinned crop, and the overlay keeps the panes' zoom (#565)
- feat(ui): PanZoom centres an image smaller than its pane (#566)
- feat(visual-diff-ui): a pinned crop opens filling its pane, and the screenshot follows at one scale (#567)
- feat(visual-diff-ui): the shot view opens on the story's tile of the board (#568)
- fix(visual-diff-ui): clearing a crop opens the whole board fitted, not at the crop's zoom (#569)
- feat(visual-diff-ui): a report can be deleted from its own page (#571)
- test(e2e): the report page's own delete, in the local loop and in sample mode (#572)
- feat(visual-diff-ui): the shot view's title opens the story in Storybook (#573)
- fix(visual-diff-ui): a filtered set and a compare pair are links (#574)
- docs(blog): the merge that passed every check and did not ship (#575)
- design: the boards' Badge meets Badge.css — tiles on --color-bg, stage crops, the Accent label (#576)
- feat(visual-diff-ui): the shot view's overlay is a link — view, blend, opacity, nudges and zoom (#577)
- fix(visual-diff-ui): the overlay's stage takes its own height on a wide screen too (#578)
- build(gate): the gate runs locally, before every push (#580)
- fix(visual-diff-ui): the sets table keeps room for the label and scrolls past it (#579)
- docs(releasing): with the workflows disabled, publishing no longer refreshes /changelog (#581)
- build(format): Prettier skips what git ignores on one machine only (#582)
- fix(deps): mermaid 12.2.0 for katex 0.18, and handlebars 4.7.10 by override (#583)
- test(e2e): the local loop reads a clean run by its note, since #563 drew no review controls there
- build(turbo): the console's tests read the committed design boards, so their cache keys on them (#585)
- docs(designs): one structure for every .pen, written down before any board moves (#590)
- design(designs): the parent .pen's colours follow the theme (#591)
- feat(designs): tier boards, one tile per story, and every consumer renamed in one PR (#592)
- build(turbo): Storybook's build keys on the design boards it serves (#593)

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
