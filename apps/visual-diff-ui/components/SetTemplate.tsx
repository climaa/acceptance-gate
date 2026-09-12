import NextLink from 'next/link';
import { Badge, Stack } from '@gate/ui';
import type { CanonicalSet } from '@/lib/baselines';
import { UNKNOWN, formatBytes, shortSha } from '@/lib/outcome';
import { filterCounts, type SetShots, tierFilterCounts } from '@/lib/set-shots';
import type { CaptureSet } from '@/lib/summary';
import { Field } from './Field';
import { Filtered, SetFilterBar } from './SetFilterBar';
import { Note } from './Note';
import { StoryScreenshots } from './StoryScreenshots';

/**
 * One screenshot set, read.
 *
 * Synchronous and props-only, like the two templates beside it: the page above
 * resolves the data directory and awaits the readers, so every branch here can
 * be rendered from literal rows without a filesystem.
 *
 * Nothing on this page mutates. There is no delete, no prune, no accept — the
 * only control is the way back — so `frozen` never reaches it and a deployed or
 * sample console renders exactly what a local one does.
 */

/** `region`, not `banner`, for the reason components/ReportTemplate.tsx sets out
 *  at length: a `<header>` inside `<main>` has no implicit role, and
 *  `role="banner"` would manufacture a second top-level banner beside the
 *  shell's `SiteHeader` rather than preserve this element's own semantics. */
const HEADER_LABEL = 'set';

/** The corpus's provenance: the commit that accepted it, and the host that drew
 *  it. The stamp is the whole reason this page answers "what did the container
 *  render" — local Storybook shows the component as THIS machine's font stack
 *  draws it, and the screenshot is what the pinned image drew instead. */
function CorpusFacts({ corpus, shots }: { corpus: CanonicalSet; shots: SetShots }) {
  return (
    <Stack gap={2}>
      <Stack direction="row" gap={4} align="center" wrap className="vd-set__facts">
        <Field label="accepted" value={shortSha(corpus.sha)} />
        <Field label="date" value={corpus.acceptedAt ?? UNKNOWN} />
        <Field label="screenshots" value={String(shots.shots)} />
        <Field label="size" value={formatBytes(shots.bytes)} />
      </Stack>

      {shots.env && (
        <dl className="vd-set__env">
          {Object.entries(shots.env).map(([key, value]) => (
            <div className="vd-set__env-pair" key={key}>
              <dt className="vd-set__env-key">{key}</dt>
              <dd className="vd-mono vd-set__env-value">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </Stack>
  );
}

/** A captured set's provenance, which is a different claim from the corpus's and
 *  says so. `sets.json` records the checkout a capture came from; it records no
 *  host at all, so the container stamp above has no counterpart here and this
 *  page does not invent one. */
function CaptureFacts({ set, shots }: { set: CaptureSet; shots: SetShots }) {
  return (
    <Stack gap={2}>
      <Stack direction="row" gap={4} align="center" wrap className="vd-set__facts">
        <Field label="sha" value={shortSha(set.sha)} />
        <Field label="branch" value={set.branch} />
        <Field label="captured" value={set.capturedAt} />
        <Field label="screenshots" value={String(shots.shots)} />
        <Field label="size" value={formatBytes(shots.bytes)} />
      </Stack>

      <Note name="capture provenance">
        a capture set records the checkout it came from, not the host it ran on — only the
        committed corpus carries the container stamp its shots were drawn with
      </Note>
    </Stack>
  );
}

export interface SetTemplateProps {
  shots: SetShots;
  /** The corpus row, when this set is the corpus and there is a checkout to read
   *  one from. Null for a capture set. */
  corpus: CanonicalSet | null;
  /** The registry row, when the set is one this instance captured. */
  set: CaptureSet | null;
}

export function SetTemplate({ shots, corpus, set }: SetTemplateProps) {
  // Once, not per tier: the same nine numbers feed the bar's jump links and every
  // tier heading below.
  const perTier = tierFilterCounts(shots.sections);

  return (
    // What every filter rule in set.css hangs off: the bar's radios are inside
    // this subtree, so `:has()` can read a checked one from here. NOT `vd-set` —
    // console.css already owns that for the sets table's label cell, and a page
    // root wearing it inherits an inline-flex meant for one word.
    <Stack className="vd-set-view" gap={5}>
      <header role="region" aria-label={HEADER_LABEL} className="vd-set__header">
        <Stack gap={3}>
          <Stack direction="row" gap={3} align="center" wrap>
            <NextLink className="vd-set__back vd-mono" href="/">
              ← console
            </NextLink>
            <h1 className="vd-set__label vd-mono">{shots.label}</h1>
            {shots.isCanonical && <Badge tone="success">canonical</Badge>}
          </Stack>

          {corpus && <CorpusFacts corpus={corpus} shots={shots} />}
          {!corpus && set && <CaptureFacts set={set} shots={shots} />}

          {shots.ignored.length > 0 && (
            <Note name="unreadable files">
              {shots.ignored.length} file(s) in this set name no cell of the capture
              matrix and are not shown: {shots.ignored.join(', ')}
            </Note>
          )}
        </Stack>
      </header>

      {/* A SIBLING of the header, not a child of it: `position: sticky` is
          clipped by its own parent's box, so a bar inside a header that scrolls
          away goes with it. */}
      <SetFilterBar
        counts={filterCounts(shots.sections)}
        perTier={perTier}
        sections={shots.sections}
      />

      {shots.sections.map((section) => (
        <section
          aria-labelledby={`vd-tier-${section.tier}`}
          className="vd-tier"
          key={section.tier}
        >
          <Stack gap={3}>
            <h2 className="vd-tier__title" id={`vd-tier-${section.tier}`}>
              {section.tier}{' '}
              <span className="vd-count vd-mono">
                {/* Follows the filter for the reason the bar's count does: a
                    heading claiming 37 stories over three of them is the page
                    contradicting itself. */}
                <Filtered
                  counts={perTier[section.tier]}
                  render={(count) =>
                    `${count.stories} stories · ${count.shots} screenshots`
                  }
                />
              </span>
            </h2>

            {section.groups.map((group) => (
              <StoryScreenshots group={group} key={group.key} label={shots.label} />
            ))}
          </Stack>
        </section>
      ))}
    </Stack>
  );
}
