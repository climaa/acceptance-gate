import NextLink from 'next/link';
import { Fragment } from 'react';
import { Badge, Stack, Text } from '@gate/ui';
import type { CanonicalSet } from '@/lib/baselines';
import { reportSides } from '@/lib/report-view';
import type { CaptureSet, Summary } from '@/lib/summary';
import { DeleteReportFromPage } from './ConfirmDialogs';
import { ReportResults } from './ReportResults';

/**
 * The report page: what was compared, and everything that came of it.
 *
 * The header is a server component — nothing in it changes while a reviewer
 * works — and the review loop below it is the one client island, so the identity
 * of the two capture sets is in the first HTML the browser receives rather than
 * behind hydration.
 */

/**
 * The header is the report's own landmark, so a scenario can scope "both sets
 * are identified" to it rather than to the whole page.
 *
 * `region`, not `banner`. A `<header>` nested inside `<main>` carries no
 * implicit landmark role at all, so `role="banner"` here was not this element's
 * own semantics being preserved — it was a second top-level banner being
 * manufactured beside the shell's `SiteHeader`, which is `packages/ui`'s and
 * cannot be de-landmarked from here. Labelling the two apart makes each of them
 * findable; it does not make two banners legal.
 *
 * Nothing in the repo would have said so. axe tags
 * `landmark-no-duplicate-banner` `best-practice`, and `a11y.steps.ts` filters to
 * `wcag2a/wcag2aa/wcag21a/wcag21aa` — correctly, since a best-practice rule is
 * not a conformance failure — so the four axe scenarios pass either way, and
 * this app has no visual baseline at all.
 *
 * A labelled `region` is still a landmark, so the query only changes noun:
 * `banner "report"` becomes `region "report"`, and everything that scoped to it
 * scopes to it unchanged.
 */
const HEADER_LABEL = 'report';

/** The disclosure's own name — what a reviewer clicks to get the screenful
 *  back, and what a scenario finds it by. */
const DETAILS_LABEL = 'report details';

/** One capture set, as the header identifies it. A label the registry has never
 *  heard of still renders — a report can outlive the set it was built from, and
 *  a header that dropped the side would be hiding half the comparison. */
function SetLine({
  side,
  label,
  set,
  corpus,
}: {
  side: string;
  label: string;
  set?: CaptureSet;
  /** The committed corpus, when this side names it: it is not in the capture
   *  registry by design, so without this a `baselines` side read as missing. */
  corpus?: CanonicalSet | null;
}) {
  return (
    <>
      <Text variant="label" as="dt" className="vd-report__side">
        {side}
      </Text>
      <dd className="vd-report__identity">
        <span className="vd-mono vd-report__label" title={label}>
          {label}
        </span>{' '}
        {set ? (
          <span className="vd-report__meta">
            <span className="vd-mono">{set.sha}</span> ·{' '}
            <span className="vd-mono" title={set.branch}>
              {set.branch}
            </span>{' '}
            · <span className="vd-count">{set.stories}</span> stories
          </span>
        ) : corpus ? (
          <span className="vd-report__meta">
            canonical · accepted <span className="vd-mono">{corpus.sha ?? '—'}</span> ·{' '}
            {corpus.acceptedAt ?? '—'} ·{' '}
            <span className="vd-count">{corpus.stories}</span> stories
          </span>
        ) : (
          <span className="vd-report__meta">
            no capture set recorded under this label
          </span>
        )}
      </dd>
    </>
  );
}

/** The run's own parameters, all inside the one disclosure below: nested folds
 *  are two clicks to reach one fact, and a reviewer who has opened the details
 *  wants everything about the run at once. */
function RunInfo({ report }: { report: Summary }) {
  return (
    <div className="vd-report__run-info">
      <dl className="vd-fingerprints">
        <dt>thresholds</dt>
        <dd className="vd-mono">
          {report.thresholds.maxDiffPixels} px · ratio {report.thresholds.maxDiffRatio}
        </dd>
        {Object.entries(report.env).map(([name, value]) => (
          <Fragment key={name}>
            <dt>{name}</dt>
            <dd className="vd-mono">{value}</dd>
          </Fragment>
        ))}
      </dl>
    </div>
  );
}

export interface ReportTemplateProps {
  id: string;
  report: Summary;
  /** Every registered capture set — the two sides are looked up in it by label. */
  sets: readonly CaptureSet[];
  /** The committed corpus, or null where there is none to read. */
  corpus?: CanonicalSet | null;
  /**
   * Whether this console can change nothing — deployed, or showing the committed
   * fixtures. The header's delete is left out entirely then, as the tables leave
   * out theirs (`DashboardTemplate` names the same flag). Frozen unless told
   * otherwise: a caller that forgets to say gets no destructive control, rather
   * than one every press of which the server refuses.
   */
  frozen?: boolean;
}

export function ReportTemplate({
  id,
  report,
  sets,
  corpus = null,
  frozen = true,
}: ReportTemplateProps) {
  const sides = reportSides(id);
  const byLabel = new Map(sets.map((set) => [set.label, set]));

  return (
    <Stack gap={6}>
      <header role="region" aria-label={HEADER_LABEL} className="vd-report__header">
        <Stack gap={3}>
          <Stack direction="row" gap={3} align="baseline" wrap>
            <NextLink className="vd-report__back" href="/">
              ← console
            </NextLink>

            <Text variant="heading-2" as="h1" className="vd-report-id" title={id}>
              {id}
            </Text>

            <Badge tone={report.exitCode === 0 ? 'success' : 'warning'}>
              exit {report.exitCode}
            </Badge>

            {/* The first screenful has to answer "is anything inaccessible?" —
                so the count rides in the header as well as leading the chips. */}
            {report.counts.a11y > 0 && (
              <Badge tone="danger">a11y {report.counts.a11y}</Badge>
            )}

            {/* Last in the row and pushed to its end: x-visual-diff-pages draws it at the
                header's right edge, away from the id it would otherwise read as
                a decoration of. The one client island in this header. */}
            {frozen ? null : (
              <span className="vd-report__delete">
                <DeleteReportFromPage id={id} />
              </span>
            )}
          </Stack>

          {/* The two sides stay in view: which sets were compared is what a
              reader arriving at a shared link needs first. */}
          <dl className="vd-report__sets">
            <SetLine
              side="A"
              label={sides.a}
              set={byLabel.get(sides.a)}
              corpus={corpus?.label === sides.a ? corpus : null}
            />
            <SetLine
              side="B"
              label={sides.b}
              set={byLabel.get(sides.b)}
              corpus={corpus?.label === sides.b ? corpus : null}
            />
          </dl>

          {/* Folded by default: the run's parameters are read once per report,
              so the first screenful goes to the comparisons instead. The rows
              stay inside this landmark either way — a fold changes what is on
              screen, never what the report says it ran with. */}
          <details className="vd-report__more">
            <summary>{DETAILS_LABEL}</summary>

            <RunInfo report={report} />
          </details>
        </Stack>
      </header>

      <ReportResults reportId={id} report={report} sides={sides} />
    </Stack>
  );
}
