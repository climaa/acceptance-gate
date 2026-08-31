# Sample fixtures for `visual-diff-ui`

The demo data a deployed instance falls back to when `.snapshots`/`.reports` are empty —
served with `isSample: true` so the UI can badge every screen as sample data. Committed so
that an instance with no CLI behind it still shows **the moment of deciding**, not an empty
console.

## What the reports are

Two, and both are real runs. The first is the regression the fixture was built
around; the second exists because one report could only ever show one verdict,
and a console that demos `changed` and nothing else never shows a reviewer what
the other buckets look like.

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
committed corpus is not a capture set. The console says so in the report header
— "no capture set recorded under this label" — which is itself a state worth
demoing.

**Still not demoed: `removed`, `errored`, `a11y`.** No corpus event has produced
them, and, as above, none is fabricated to fill the gap.

## Layout

```bash
fixtures/
├── sets.json                     # the three capture sets the console lists
└── reports/
    ├── main-2026-08-17__main-2026-08-13/
    │   ├── summary.json          # schema of packages/visual-diff, plus isSample: true
    │   └── shots/
    │       └── <variantKey>.{baseline,candidate,diff}.png
    └── baselines__main-2026-08-24/
        ├── summary.json
        └── shots/
            └── <variantKey>.candidate.png   # added: no baseline, so no diff
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
# then collect: __baselines__/<key>.png and .visual-diff/diffs/<key>.png. The
# candidate shot itself is not written to disk by a normal `check` run — capture
# it separately (e.g. a one-off script calling capture.mjs's captureAll and
# writing the returned bytes) now that report.html, the one place it used to be
# embedded, is retired.
```

The capture must run in the pinned container — a bare-metal capture renders with the
host's font stack and would visibly disagree with the committed baselines, which is the
exact failure mode this tool exists to catch.
