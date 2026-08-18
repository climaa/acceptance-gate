# The visual-diff worlds' overlay

Everything in this directory is **fabricated**, and deliberately so.

`apps/visual-diff-ui/fixtures/` is the authentic half: a real regression from this
repo's history, seen backwards through the differ, which invents nothing and
legitimately reports `a11y: 0`. That file set is never edited — not to add a
scenario's state, not to make an assertion pass. `scripts/seed-visual-diff.mjs`
copies it into each world's data directory and applies the JSON here on top of the
copy.

What the fixture cannot honestly show, and what each file here adds:

| File                 | Adds                                                                              |
| -------------------- | --------------------------------------------------------------------------------- |
| `sets.json`          | five capture sets, one of them `dirty` — the registry the console lists           |
| `worktrees.json`     | the D2 hold on the oldest set, which the refused delete names                     |
| `history.json`       | one run per outcome word: `succeeded`, `succeeded (diffs)`, `failed`, interrupted |
| `shots.json`         | the variant keys each set's shot tree carries, and which of them drifted          |
| `report-graft.json`  | a `changed`, a `removed` and an `a11y` variant, plus two corpus warnings          |
| `report-accept.json` | a second, clean report — the only kind an accept can promote from                 |
| `baseline-env.json`  | the stamp an accept restamps, in the mutating world only                          |

The PNGs are not committed. The script synthesises them: real 16×16 RGBA PNGs whose
pixels are a SHA-256 of the variant key, so the same seed produces the same bytes on
every machine and a re-seed is a no-op. A key listed in `shots.json`'s `drifted` mixes
its set's label into that seed, which is what makes a comparison between two sets
report something rather than eighteen `unchanged` rows.

## Why there are two reports

`report-graft.json` puts an accessibility failure into the report the review and a11y
scenarios read, and `acceptGate` refuses one before it asks anything else — so on a world
holding only that report, the accept tab's other two answers (the review gate and the host
warning) are states no scenario could reach. `report-accept.json` is the report those
scenarios are about: the two newest sets compared, nothing but pixels between them. Its
two sides are copied out of those sets' own shot trees, so an accept promotes the bytes
`sets/main-2026-08-16/` holds rather than something this directory invented; only the diff
is synthesised, because nothing here paints one.

## Where each world differs

- **seeded** gets `worktrees.json`; **mutating** does not. The mutating world owns the
  prune scenario, and a registered worktree would make the server skip the very row
  that scenario asserts is gone.
- **mutating** additionally gets `__baselines__/` and its `BASELINE_ENV.json`, which is
  what an accept promotes into. Every accept effect stays under `VISUAL_DIFF_DATA_DIR`.
- **sample** gets nothing at all — an empty directory is the state under test.

## Known gap

`report-graft.json`'s accessibility variant carries `color-contrast` and its node
count, which is all `SummarySchema` version 1 has room for: a violation is
`{ id, nodes }`, and the differ records no contrast ratio per violation. The ratio the
scenario vocabulary talks about therefore rides in `warnings[]`, which the report page
renders, rather than on the variant. Giving it a field of its own is a change to
`packages/visual-diff`'s artifact schema and belongs to whoever owns that.
