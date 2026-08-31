# @gate/visual-diff

The self-built CLI that gates PRs on rendered appearance: captures every Storybook story
as a screenshot, compares it against a committed baseline corpus, and reports what moved.
No SaaS, no Chromatic — Playwright, pixelmatch, and a filesystem of PNGs this repo owns.

## Scope: a change detector, not a correctness oracle

`packages/visual-diff` exists so nothing else has to guess what CSS renders like.
Per `.sandcastle/agent-docs/CODING_STANDARDS.md`: **appearance belongs here, never to a
unit test that parses a stylesheet and asserts a colour or a ratio** — that's a proxy for
the render and drifts from it. Rendered accessibility is axe's job, not the differ's.

The distinction matters because a passing run only proves the UI **didn't move** —
it says nothing about whether the UI is _good_. A control that fails WCAG AA is
baselined green and stays green forever on pixels alone, which is why every capture also
runs an axe scan (`wcag2a`/`wcag2aa`/`wcag21a`/`wcag21aa`) and an accessibility violation
outranks the pixel verdict: a story with an a11y hit is bucketed `a11y`, never quietly
folded into `changed` or `unchanged` where accepting it would make the violation permanent.

## How it works

### The capture matrix

Every Storybook story under `packages/ui/src/{atoms,molecules,organisms,templates}/`
is captured across a tier-dependent axis of viewport and theme, defined once in
`src/policy.mjs` and consumed identically by capture, Storybook's own preview decorator,
and the atomic-design boundary lint — one set of numbers, named once:

| Tier        | Viewports        | Themes       | Shots/story |
| ----------- | ---------------- | ------------ | ----------- |
| `atoms`     | desktop          | light + dark | 2           |
| `molecules` | desktop          | light + dark | 2           |
| `organisms` | desktop + mobile | light + dark | 4           |
| `templates` | desktop + mobile | light + dark | 4           |

(`desktop` 1280×800, `mobile` 390×844, `deviceScaleFactor: 1`.) A story can opt out of
this default with a tag: `visual-diff:skip` excludes it entirely (reported, not hidden),
`visual-diff:fullpage` shoots the whole page instead of the `#storybook-root` capture
target, `visual-diff:all-viewports` widens an atom/molecule to both viewports.

Each shot is keyed `{tier}__{viewport}__{theme}__{storyId}.png` — Storybook ids are
`[a-z0-9-]` only, so the `__` separator can't collide — and lands in
`packages/visual-diff/__baselines__/` once accepted.

### Determinism

A screenshot is only a signal if two runs of the same commit agree pixel-for-pixel. Every
capture runs inside one pinned Chromium context with:

- the clock and `Math.random` frozen (fixed ISO instant, seeded PRNG) so nothing time- or
  chance-dependent renders differently between runs
- the **zone** pinned to UTC alongside that instant — a pinned clock read through the
  capturing machine's own zone is only half a pin, and near a boundary it is two
  different calendar days
- animations, transitions, caret blink, and smooth scroll killed via injected CSS
- font-rendering flags pinned (`--disable-lcd-text`, `--force-color-profile=srgb`, …) —
  a laptop and a CI container hint glyph edges differently, and this is the fix
- network locked to loopback only — a story that reaches for a web font or an analytics
  beacon fails into the same empty state every time, rather than flaking on whoever's
  network is slow that day
- a render-phase wait (Storybook's own `finished`/`completed`/`played` tracking), then an
  error-overlay check, then a `document.fonts.check` wait — a `font-display: block` race
  is the worst silent flake there is
- a **stable-shot loop**: every capture is taken twice with a jittered wait between, and
  only accepted once the pair is byte-identical (3 retries before giving up)

Two **sanity gates** run after capture, before comparison, and fail the whole run
(exit `2`, not a diff) rather than pass green on a lie: `themeSanity` (if a multi-theme
story is byte-identical across themes, theme wiring is broken) and `viewportSanity` (if no
multi-viewport story ever got narrower at the smaller viewport, the viewport isn't being
applied). A wiring bug is not a UI change, and the run says so.

### Comparing two shots

`pixelmatch` runs on the **overlap box** only — the shared top-left region when two shots
differ in size — using perceptual (YIQ) distance with antialiasing excluded, so a
laptop's and CI's differently-hinted glyph edges don't count as a diff. Anything outside
the overlap (one shot literally has no pixel there) is counted by arithmetic as
**margin pixels**, not pixel-compared. The two are summed for the verdict but sorted
separately: reports rank worst-first by _shared-region_ diff pixels alone, so a story
that simply got taller (huge margin) never outranks a story with a genuine few-hundred-pixel
repaint.

The allowance is `max(40px, 0.05% of the union area)` — a flat floor so small atoms
aren't held to an unreasonably tight ratio, and a ratio so a 1280×800 template isn't held
to the same 40px an icon is. `VISUAL_DIFF_STRICT=1` drops the allowance to zero for a
nightly double-capture flake check; it is not meant for routine PR gating.

## Running it

```bash
pnpm --filter @gate/storybook build   # capture needs the built static output, not `dev`
pnpm visual-diff                      # check: capture + compare against __baselines__
pnpm visual-diff:accept               # the new baselines — runs in the pinned container (Docker required)
```

Equivalently, direct CLI invocation with a filter (only stories whose id/title contain
the substring):

```bash
node packages/visual-diff/src/cli.mjs check --filter button
```

Review `packages/visual-diff/.visual-diff/summary.md` for the worst-first table, and
`packages/visual-diff/.visual-diff/diffs/` for a PNG per failing variant. The console
(`apps/visual-diff-ui`) renders the fuller report — baseline/candidate/diff triptychs,
blink and onion-skin compare tools — for a run it has ingested.

**First run against a fresh clone**, before any baselines are accepted: `__baselines__`
doesn't exist yet, so every capture reports `added` and `check` exits `1` — this is
expected, not a failure of the tool. `pnpm visual-diff:accept` establishes the corpus.

**Captures assume the pinned Playwright container** (`mcr.microsoft.com/playwright:v1.62.1-noble`,
named in `policy.mjs`'s `HOST`) — the same image locally and in CI. Running bare-metal is
not guaranteed a clean capture (font-rendering and platform drift are exactly what the
determinism controls above exist to route around); a bare-metal capture is only useful
for a quick local sanity check, not for accepting baselines.

### Running the pinned container locally

`accept` carries no host guard (see below), so a bare-metal `accept` doesn't fail loud —
it silently writes baselines rendered by whatever font/graphics stack the host has, then
stamps `BASELINE_ENV.json` as if they came from the pinned container. Which is why the
container is the front door, not a recipe to remember: `pnpm visual-diff:accept` routes
through `scripts/visual-diff-container.mjs`, and the same wrapper runs `check` in the
container too:

```bash
pnpm --filter @gate/storybook build   # host build first — static output, not platform-dependent
pnpm visual-diff:container check      # review packages/visual-diff/.visual-diff/summary.md
pnpm visual-diff:accept               # the container-run accept
```

What the wrapper composes (further arguments — `--filter`, say — pass to the CLI
verbatim):

```bash
docker run --rm --ipc=host --platform=linux/arm64 \
  -v "$(pwd)":/repo -w /repo \
  -e PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
  mcr.microsoft.com/playwright:v1.62.1-noble \
  node packages/visual-diff/src/cli.mjs <check|accept> [options]
```

No `pnpm install` inside the container — every dependency this package touches
(`playwright`, `pixelmatch`, `pngjs`, `@axe-core/playwright`) is pure JS with no native
binaries to rebuild per-OS, so the host-installed `node_modules` works as-is once
mounted. `PLAYWRIGHT_BROWSERS_PATH=/ms-playwright` points Playwright at the browser
already baked into the image instead of the host's own Playwright cache (which won't
exist, or won't be the right OS's build, inside the container). `--ipc=host` avoids
Chromium crashing against Docker's default 64MB `/dev/shm`. `--platform=linux/arm64`
pins the image to the architecture `BASELINE_ENV.json` records, so an amd64 host can't
silently accept baselines CI's arm64 guard would then reject on every run — on amd64
that means qemu emulation, slow and possibly crashy, but loud rather than corrupting.

If bare-metal output has already landed in the working tree, discard it before rerunning
in the container — both the committed baselines the `accept` touched and any newly
untracked ones it added:

```bash
git checkout -- packages/visual-diff/__baselines__/
git clean -fd packages/visual-diff/__baselines__/
```

### The host guard

`check` reads `__baselines__/BASELINE_ENV.json` and compares `platform`/`arch`/`image`/
`playwright` against the machine actually running. A mismatch blocks the run (exit `2`)
rather than comparing shots that were never rendered the same way — pass
`--allow-host-mismatch` (or `VISUAL_DIFF_ALLOW_HOST_MISMATCH=1`) to downgrade it to a
warning when you know what you're doing; the pixel verdict itself still stands. `accept`
carries no host guard — it produces the new baseline, so there's nothing yet to be
comparable to — but it restamps `BASELINE_ENV.json` with the accepting machine's
fingerprint every time.

### Exit codes

```text
0  unchanged
1  a human must look   (any changed/added/removed/errored/a11y variant)
2  the gate is broken  (corpus never built, a sanity gate tripped, host mismatch, accept over budget)
```

`2` is deliberately never merged into `1` — "the corpus never built" is not a diff
report, and a broken-gate message is written to stderr, not stdout, so a red CI job reads
it first.

### Accepting baselines

`accept` is all-or-nothing: if any capture errored, nothing is written. Before writing
anything it checks a budget — 512,000 bytes per PNG, 5,000,000 bytes for the whole
corpus — and refuses the entire accept if either is exceeded. An unfiltered accept prunes
baseline keys nothing in the run claimed (deleted or renamed stories); a filtered accept
(`--filter`) leaves out-of-scope baselines untouched instead.

## Artifacts

Everything below is written to `packages/visual-diff/.visual-diff/` — gitignored,
per-run scratch output. `packages/visual-diff/__baselines__/` is the opposite: **committed**,
and the only directory here that is.

| File              | What it is                                                                                                                                                                                                                       |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `summary.json`    | Schema-versioned machine output: counts, thresholds, host env, every non-unchanged variant, worst-first                                                                                                                          |
| `summary.md`      | The diff body of the PR comment, rendered only from `summary.json` — never re-derived from raw rows, so the two can't disagree about what changed. Carries no run-specific links; `pr.yml` appends those to the comment it posts |
| `diffs/{key}.png` | One diff image per failing variant only — never generated for `unchanged`, to keep artifact size down                                                                                                                            |

## CI status

Wired, and deliberately not a required check. A `visual-diff` job in
`.github/workflows/pr.yml` runs `pnpm visual-diff` on every non-draft PR — same pinned
`mcr.microsoft.com/playwright:v1.62.1-noble` container, on the matching `arm64` runner —
posts `summary.md` as a sticky PR comment (created once, updated in place on later
pushes), and uploads `summary.md`, `summary.json` and the diff PNGs as a workflow
artifact. The job
fails its own status on a real diff (a visible ❌ in the PR checks list), but it is never
added to `gate.needs`, so it never blocks a merge on its own.

On a red run the comment carries a link footer the file itself cannot: the uploaded
artifact, this run, and — on a same-repo PR — a dispatch link for `accept-baselines`
scoped to the branch. `summary.md` holds no URLs on purpose (it has no run to name when
a developer produces it locally), so those are built in `pr.yml` from `context`, which is
the only place a run id exists. That is also why the comment names the dispatch as the
first way to accept: a reviewer without Docker or arm64 hardware should not have to open
this file to find the way forward.

That's intentional, not a gap to close later. Per
[`visual-regression-with-agents.mdx`](../../apps/blog/content/posts/visual-regression-with-agents.mdx):
a numeric pixel threshold stops being a safety net once change volume is high, and
approving a baseline has to cost the same as reviewing a code diff — a person, reading
the PR, not a required check nobody looks at before merging. `pnpm --filter
@gate/visual-diff test` (the unit suite) still runs in CI as part of the generic `test`
job, same as before, and — like every job in this file — is gated by `gate.needs`.

Two more workflows close the accept loop:

- **`accept-baselines.yml`** (manual `workflow_dispatch`) runs `accept` on the same
  pinned container/runner pair, for a maintainer without local Docker or arm64
  hardware. Dispatched on a feature branch, it commits the accepted corpus back to that
  branch, so the baselines land in the PR that moved the pixels; dispatched on `main`,
  it opens a `chore/accept-baselines-*` PR instead. Both ends stay human — a person
  dispatches it, and a person reviews the PNGs before anything merges. One wrinkle: a
  push made with the workflow's own token starts no workflows, so the gate needs a
  close/reopen (or any human push) before the resulting PR can go green.
- **`nightly-determinism.yml`** (03:17 UTC cron, dispatchable by hand) captures
  `main`'s corpus twice under `VISUAL_DIFF_STRICT=1` — the zero-allowance mode named
  above. One red capture is run-to-run flake; two red on the same story is
  deterministic drift from the committed corpus. Each capture's report uploads as its
  own artifact so the two can be compared.

## Version pins

`playwright` is pinned exactly (`1.62.1`, no caret) — it has to match `HOST.comparedKeys`
and the `mcr.microsoft.com/playwright:v1.62.1-noble` image tag named in `policy.mjs`
exactly, or the host guard blocks every run. A Playwright bump is a hand-authored change
that moves the pin, the image tag, and the baselines together — never a bot PR (see
`apps/e2e/README.md`'s matching pin for the same reason).
