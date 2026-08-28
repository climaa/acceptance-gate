# acceptance-gate

A public portfolio monorepo whose subject is its own pipeline. Two domains share
one vocabulary here: the **merge pipeline** that decides whether a change may
land, and the **visual-regression** tooling that judges whether the interface
moved. Several words belong to both, which is why this file exists.

This is a glossary. It defines what terms mean, never how anything works.

**Reading this file.** These rulings are the target vocabulary, not a description
of the code — several are not true yet. Follow them in new prose, new names and
new issue bodies. Do not rename existing code, delete a deprecated artifact, or
widen a change to enforce a ruling; each of those is its own board item.

## The repository

**gate**:
Unqualified, the required status check that decides whether a pull request may
merge. Four other things answer to the word and are always qualified: the
_project_ (`acceptance-gate`, this repository), the _package scope_ (`@gate/*`),
the _complexity gate_ (the health check's cognitive-complexity limit), and
_sanity gates_ (the differ's internal checks that a run was not blind).
_Avoid_: the bare word for anything but the required check. Note the board's
Phase 5 title uses the project sense.

**Wave**:
A numbered delivery slice on the project board. Board-only; no referent in code.

**Phase**:
The same kind of slice as a Wave, not a tier above it. Phase 0 preceded Wave 1
and Phase 5 follows Wave 5, so the two words do not form a hierarchy.
_Avoid_: reading Phase as a container for Waves.

**draft**:
A board row with no issue behind it. Invisible to the dispatch queue, so a draft
is never queued work however its status column reads.
_Avoid_: treating a Todo draft and a Todo issue as the same state.

## Capturing

**capture**:
The act of producing a screenshot set. A verb, never a noun.
_Avoid_: snapshot, shoot

**screenshot**:
One PNG — a single story rendered at one tier, one viewport and one theme.
_Avoid_: shot, snapshot, image

**screenshot set**:
Every screenshot one capture produced, at one commit. Labelled by release tag.
Short form: _set_.
_Avoid_: snapshot set, capture set

**tier**:
An atomic-design layer: atoms, molecules, organisms or templates.

**viewport**:
Desktop or mobile.

**theme**:
Light or dark.

**variant**:
One cell of the capture matrix — a story at one tier, viewport and theme. The
addressable unit a screenshot belongs to.

**baselines**:
The screenshot set committed to this repository, which captures are judged
against. Changed by a commit, never by the console. _Canonical_ describes its
status; _corpus_ is prose for the same thing.
_Avoid_: canonical set or corpus as its name.

## Comparing

**before** / **after**:
The two screenshot sets a comparison run judges against each other. Either side
may be `baselines`.
_Avoid_: baseline and candidate for the comparison axis — `baselines` is a set,
not a side.

**diff**:
The generated image showing what moved between before and after.
_Avoid_: the word alone for the verdict or the pixel counts.

**comparison**:
What came of judging one variant's _after_ screenshot against its _before_.
Carries exactly one bucket.

**bucket**:
A comparison's verdict: unchanged, changed, added, removed, errored, or a11y.

**report**:
The record of one comparison run — every comparison it produced, and the
screenshots behind them. One concept with two renderings: the console's pages,
and a standalone HTML file (deprecated, see below).

**summary row**, **report card**:
Stages downstream of a comparison, not synonyms for one. A _summary row_ is a
comparison as recorded; a _report card_ groups one story's variants for reading.

## Running

**job**:
A unit of work the console tracks and shows. One at a time.
_Avoid_: run

**run**:
An execution you invoke — a CLI invocation or a CI workflow run. Never the
console's unit of work.
_Avoid_: run for anything the console displays.

**accept**:
The command that commits a fresh capture as the new `baselines`.

**the acceptance suite**:
The Gherkin end-to-end suite. Unrelated to `accept`, despite this repository's
name.

**refusal**:
A mutation the console declines to perform, together with the sentence saying
why. An HTTP error status and a thrown budget error are neither of these.

**artifact directory** / **data directory**:
Two different directories, both named `.visual-diff`. The _artifact directory_
holds one differ run's output. The _data directory_ is the console's store of
sets, reports and jobs. Always qualified; the bare name is ambiguous.

**Mode**:
Unqualified, one cell of the capture matrix — a tier, a viewport, a theme.
Job modes and comparison modes are always qualified.
_Avoid_: the bare word for a job tab or a viewer mode.

## Deprecated

**report.html**:
The differ's standalone HTML rendering of a report. Deprecated in favour of the
console's pages. Until it is removed, CI review reads the summary comment and
the diff images.

**snapshot**:
Retired as a domain term. Use _screenshot_ for the image and _screenshot set_
for the collection. (Unrelated to the React store-subscription sense.)

**run (as a job mode)**:
A retired synonym for `capture`. The literal survives so historical rows still
parse; it names nothing new.
