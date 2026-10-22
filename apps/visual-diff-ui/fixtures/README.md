# Sample fixtures for `visual-diff-ui`

The demo data a deployed instance falls back to when `.snapshots`/`.reports` are empty —
served with `isSample: true` so the UI can badge every screen as sample data. Committed so
that an instance with no CLI behind it still shows **the moment of deciding**, not an empty
console.

## What the reports are

Four, and all are real runs. The first is the regression the fixture was built
around; the second exists because one report could only ever show one verdict,
and a console that demos `changed` and nothing else never shows a reviewer what
the other buckets look like. The third is the corpus's latest movement, which is
where the Pagination stories are; the fourth is that same pair read backwards,
because it is the only honest way this corpus has to show `removed`.

## 1. `main-2026-08-17__main-2026-08-13` — a real regression

A real regression from this repo's history, not a manufactured diff. PR
[#242](https://github.com/climaa/acceptance-gate/pull/242) (_fix(ui): let the owl selector
own prose vertical rhythm_, merged 2026-08-13) moved the vertical rhythm of every prose
surface. This fixture is that change, seen backwards through the differ:

- **A / baseline** — the committed `packages/visual-diff/__baselines__` corpus
  (`main` @ `f2570e1`, 2026-08-17), which carries the fix.
- **B / candidate** — a fresh capture of `main`'s tip from just before the fix
  (`e0427b4`, 2026-08-13), taken in the pinned Playwright container.

Six variants changed — exactly the two prose surfaces the owl selector owns, across
themes and viewports — and all six are kept, so `summary.json`'s counts are the run's
real counts, untrimmed:

| variant                                                      | diff pixels |
| ------------------------------------------------------------ | ----------- |
| `atoms__desktop__dark__atoms-prose--default`                 | 65,944      |
| `atoms__desktop__light__atoms-prose--default`                | 62,136      |
| `templates__desktop__dark__templates-posttemplate--default`  | 28,172      |
| `templates__desktop__light__templates-posttemplate--default` | 27,942      |
| `templates__mobile__dark__templates-posttemplate--default`   | 13,882      |
| `templates__mobile__light__templates-posttemplate--default`  | 13,666      |

The run also produced a real corpus warning (2 stories skipped by `visual-diff:skip`),
kept in `warnings[]` for the report's warning strip. There is no `a11y` variant because
the corpus has no accessibility violations — the fixture doesn't fabricate one.

## 2. `baselines__main-2026-08-24` — a real corpus addition

Ten `added` variants: the five `IconButton` stories, across both themes, entering
the corpus. A `check` run compares the candidate against the committed
`__baselines__`, and on 2026-08-24 those baselines did not have them yet — they
were accepted later, in [#335](https://github.com/climaa/acceptance-gate/pull/335).
So this is the differ's own answer to "a story that is new", not a hand-written
row: no baseline on side A, a candidate on side B, and nothing to diff between
them.

It is also the one report here whose `env` reads `darwin` rather than the pinned
container. That is deliberate and worth stating rather than hiding. The container
rule exists because a host font stack renders text differently and would produce
_false diffs_ against container-rendered baselines — but an `added` variant has
no baseline and is never compared, so there is no verdict for the host to
falsify. The shots are screenshots of new stories, and the pixel counts on those
rows are `NOTHING_COMPARED` zeros, which the console now declines to print at
all.

Side A is labelled `baselines` and has no entry in `sets.json`, because the
committed corpus is not a capture set. The report header reads that side from the
corpus the console has — traced into a deployment beside the fixtures — so it
names today's accepting commit and story count, not the 2026-08-24 corpus this
run actually compared against. That is the header's rule everywhere, not a
fixture quirk: a `baselines` side always describes the corpus as it is now.

## 3. `main-2026-09-17__main-2026-10-13` — the corpus's latest movement

The committed `__baselines__` corpus at two commits, compared by the console's
own `compareSets` — the code path a compare job runs. No capture was taken:
both sides are corpus bytes already captured in the pinned container, and
comparing two PNGs moves no pixels. That is why `env` reads `darwin`, the host
that did the arithmetic, and why it does not weaken the verdict the way a
host-rendered side would. Both corpora's own `BASELINE_ENV.json` name the
pinned image.

- **A** — `a78c467` (2026-09-17), the last commit before the corpus moved again.
  Its corpus is byte-for-byte the one at `d9d8e96`.
- **B** — `c013d86` (2026-10-13), today's corpus.

Three things landed in between, and the differ's verdict on each is the point:

| change                                                                  | variants | verdict                                                                                                                  |
| ----------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------ |
| [#460](https://github.com/climaa/acceptance-gate/pull/460) dialog story | 4        | `changed` — 9,305–14,136 px                                                                                              |
| [#483](https://github.com/climaa/acceptance-gate/pull/483) footer mark  | 4        | `changed` on mobile (53 and 52 px against an allowance of 40); `unchanged` on desktop, which the ratio threshold absorbs |
| [#491](https://github.com/climaa/acceptance-gate/pull/491) Pagination   | 12       | `added`                                                                                                                  |

So eight baselines moved and six are `changed`. The two that are not are kept
that way: a report that rounded them up would be demoing a differ with no
threshold, and the footer's version mark is exactly the kind of change the
threshold exists to let through.

## 4. `main-2026-10-13__main-2026-09-17` — the same pair, backwards

Side A and side B swapped, the way report 1 reads #242 backwards. The six
`changed` variants stay `changed`, and the twelve Pagination stories become
`removed`: present in the baselines, absent from the candidate. The corpus has
never deleted a story, so this is the only real run that can show what a
removed variant looks like — and it is the differ's own answer, not a row
written by hand.

**Still not demoed: `errored`, `a11y`.** No corpus event has produced them, and,
as above, none is fabricated to fill the gap.

## What the sets are

Five of the six are registry rows and nothing else: `sets.json` names them so the
console has something to list and the compare pickers have something to offer, and
none of them ships the shots it claims. That is not an omission — it is the state
a real instance is in when it holds the record of a capture taken somewhere else,
and it is what the size column's em dash means. The set viewer draws no link for
them, on purpose.

`main-2026-08-30` is the exception, and the only reason it exists: a deployed
console had no way to OPEN a set, so the page that exists to show screenshots
could not be seen anywhere but a developer's own machine.

Its shots are real bytes — the committed `__baselines__` corpus at `d9d8e96`,
captured in the pinned container like everything else here. It is a slice rather
than the whole corpus, which is a `--filter`ed capture, a mode the run panel has a
field for. Fourteen shots, chosen to exercise the shapes the viewer has to survive
rather than to flatter it:

| story                             | cells | why it is here                                |
| --------------------------------- | ----- | --------------------------------------------- |
| `atoms-skeleton--line`            | 2     | 1248x12 — the thinnest thing in the corpus    |
| `atoms-badge--accent`             | 2     | 1248x25 — a component on mostly empty canvas  |
| `molecules-postcard--default`     | 2     | an ordinary desktop-only card                 |
| `organisms-siteheader--default`   | 4     | both viewports, both themes — the full matrix |
| `templates-posttemplate--default` | 4     | both viewports, and the tallest pair          |

So the demo shows the ragged matrix (three of the five stories have no mobile row,
because the corpus has none for them), the aspect ratios that drove the layout, and
all four tiers. What it does not show is a set big enough to need the tier nav —
the corpus has 160 shots and this has 14, and inflating it would cost a megabyte of
committed PNGs to demonstrate scrolling.

## Layout

```bash
fixtures/
├── sets.json                     # the six capture sets the console lists
├── sets/
│   └── main-2026-08-30/          # the one set that ships its shots
│       └── <variantKey>.png      # real corpus bytes, --filter'd to 14
└── reports/
    ├── main-2026-08-17__main-2026-08-13/
    │   ├── summary.json          # schema of packages/visual-diff, plus isSample: true
    │   └── shots/
    │       └── <variantKey>.{baseline,candidate,diff}.png
    ├── baselines__main-2026-08-24/
    │   ├── summary.json
    │   ├── shots/
    │   │   └── <variantKey>.candidate.png   # added: no baseline, so no diff
    │   └── ledger/
    │       └── <variantKey>.json            # after-only token ledger reports, IconButton x10
    ├── main-2026-09-17__main-2026-10-13/    # changed + added
    └── main-2026-10-13__main-2026-09-17/    # changed + removed
        └── ledger/
            └── <variantKey>.json            # paired token ledger reports, Dialog x4
```

`summary.json` follows `packages/visual-diff`'s schema (`schemaVersion` 1); `isSample:
true` is the one addition, per the fixture contract in the design docs. Unchanged
variants carry no shots, matching the real pipeline (`buildSummary` drops them).

## Regenerating the regression report

```bash
git clone --local . /tmp/ag-old && cd /tmp/ag-old && git checkout e0427b4
pnpm install --frozen-lockfile
rm -rf packages/visual-diff/__baselines__
cp -R <repo>/packages/visual-diff/__baselines__ packages/visual-diff/__baselines__
pnpm --filter @gate/storybook build
docker run --rm --ipc=host -v "$(pwd)":/repo -w /repo \
  -e PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
  mcr.microsoft.com/playwright:v1.62.1-noble \
  node packages/visual-diff/src/cli.mjs check
# then collect: __baselines__/<key>.png and .visual-diff/diffs/<key>.png. A normal
# `check` run never writes the candidate shot to disk, so capture it separately —
# a one-off script calling capture.mjs's captureAll and writing the returned bytes.
```

The capture must run in the pinned container — a bare-metal capture renders with the
host's font stack and would visibly disagree with the committed baselines, which is the
exact failure mode this tool exists to catch.

## Regenerating reports 3 and 4

No container is needed: both sides are committed corpus bytes.

```bash
D=$(mktemp -d); mkdir -p $D/sets/main-2026-09-17 $D/sets/main-2026-10-13 $D/reports
git archive a78c467 packages/visual-diff/__baselines__ | tar -x -C $D/sets/main-2026-09-17 --strip-components=3
git archive c013d86 packages/visual-diff/__baselines__ | tar -x -C $D/sets/main-2026-10-13 --strip-components=3
echo '{"sets":[]}' > $D/sets.json
# then call lib/runner.ts's compareSets(D, { mode: 'compare', baseline, candidate })
# once per direction, and add `"isSample": true` to each summary.json.
```

## Token ledgers

Two reports carry token ledger reports under `ledger/`, so the design view has spacing
readings to show. Every other variant, and every other report, has none and shows the
"no token ledger" state, which is the backward-compatible case.

- **`main-2026-10-13__main-2026-09-17`, the four `organisms-dialog--open` variants.**
  The report reads #460 backwards: its after side is the Dialog story before #460 put
  design-system `Button`s where a bare `<button>` stood. So the readings show the real
  regression: `button "Keep it open"` · `padding-right` from `--space-4` (16px) to 6px,
  a browser default.
- **`baselines__main-2026-08-24`, the ten added `atoms-iconbutton--*` variants.** The
  before side is the committed corpus, which carries no ledgers by construction, so
  these are after-only reports. They have no off-scale reading, so the panel shows its
  after-only empty state.

**Provenance.** Both sides were captured on 2026-10-17 in the pinned container, by the
console's own capture path (`scripts/capture-set.mjs`), from `main` @ `da96298`:

- **before:** `main` as it was;
- **after (Dialog):** the same checkout with only #460's hunk to
  `packages/ui/src/organisms/Dialog/Dialog.stories.tsx` reverted. An old checkout
  could not be used, because it predates the collector.

Every captured PNG is byte-identical to the committed shot it describes: the four Dialog
shots against this report's `baseline` and `candidate` PNGs, and the ten IconButton shots
against this report's `candidate` PNGs. So each ledger measured exactly the render the
report shows. The IconButton sources did change after 2026-08-24, but only in story
comments and in a link variant those stories do not use.

**A set's own ledgers.** `sets/main-2026-08-30` carries the two
`atoms-badge--accent` ledgers (`<key>.ledger.json`), so the shot view has every
reading of a simple story to show: `--space-2` either side and a 2px pill half-step.
They come from a console capture of `main` @ `613aba4` (2026-10-16), and both PNGs
of that capture are byte-identical to this set's, so each ledger measured exactly the
render this set holds. Regenerate them the way the next paragraph does, with
`--filter atoms-badge--accent`, and copy the two `.ledger.json` files beside the PNGs.

**Regenerating.**

```bash
D=$(mktemp -d)
pnpm --filter @gate/storybook build
docker run --rm --ipc=host -v "$(pwd)":/repo -v $D/before:/data -w /repo \
  -e PLAYWRIGHT_BROWSERS_PATH=/ms-playwright mcr.microsoft.com/playwright:v1.62.1-noble \
  node /repo/apps/visual-diff-ui/scripts/capture-set.mjs --root /repo --data-dir /data \
  --label before --filter organisms-dialog--open --filter atoms-iconbutton
git show c690138 -- packages/ui/src/organisms/Dialog/Dialog.stories.tsx | git apply -R
pnpm --filter @gate/storybook build
# the same docker run into $D/after, --label after, --filter organisms-dialog--open
git checkout -- packages/ui/src/organisms/Dialog/Dialog.stories.tsx
# then pair each key as lib/runner.ts's ledgerReport does (ledger.mjs's pairLedgers,
# then serializeLedgerReport) into <report>/ledger/<key>.json. For the IconButton keys,
# use no before side.
```
