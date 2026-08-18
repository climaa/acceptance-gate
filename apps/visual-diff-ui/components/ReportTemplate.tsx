import NextLink from 'next/link';
import { Fragment } from 'react';
import { Badge, Stack } from '@gate/ui';
import { reportSides } from '@/lib/report-view';
import type { CaptureSet, Summary } from '@/lib/summary';
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
 * It is labelled, deliberately: the app shell's `SiteHeader` is already a
 * `banner` at body scope, and this route therefore has two. The label is what
 * keeps them apart for a reader and for a query (`banner "report"`) — the shell
 * is packages/ui's and cannot be de-landmarked from here.
 */
const HEADER_LABEL = 'report';

/** One capture set, as the header identifies it. A label the registry has never
 *  heard of still renders — a report can outlive the set it was built from, and
 *  a header that dropped the side would be hiding half the comparison. */
function SetLine({
  side,
  label,
  set,
}: {
  side: string;
  label: string;
  set?: CaptureSet;
}) {
  return (
    <>
      <dt className="vd-report__side">{side}</dt>
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
        ) : (
          <span className="vd-report__meta">
            no capture set recorded under this label
          </span>
        )}
      </dd>
    </>
  );
}

/** The run's own parameters, folded away: a reviewer needs them when a verdict
 *  surprises them and never before. */
function RunInfo({ report }: { report: Summary }) {
  return (
    <details className="vd-report__run-info">
      <summary>run info</summary>
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
    </details>
  );
}

export interface ReportTemplateProps {
  id: string;
  report: Summary;
  /** Every registered capture set — the two sides are looked up in it by label. */
  sets: readonly CaptureSet[];
}

export function ReportTemplate({ id, report, sets }: ReportTemplateProps) {
  const sides = reportSides(id);
  const byLabel = new Map(sets.map((set) => [set.label, set]));

  return (
    <Stack gap={6}>
      <header role="banner" aria-label={HEADER_LABEL} className="vd-report__header">
        <Stack gap={3}>
          <Stack direction="row" gap={3} align="baseline" wrap>
            <NextLink className="vd-report__back" href="/">
              ← console
            </NextLink>

            <h1 className="vd-report-id" title={id}>
              {id}
            </h1>

            <Badge tone={report.exitCode === 0 ? 'success' : 'warning'}>
              exit {report.exitCode}
            </Badge>

            {/* The first screenful has to answer "is anything inaccessible?" —
                so the count rides in the header as well as leading the chips. */}
            {report.counts.a11y > 0 && (
              <Badge tone="danger">a11y {report.counts.a11y}</Badge>
            )}

            <RunInfo report={report} />
          </Stack>

          <dl className="vd-report__sets">
            <SetLine side="A" label={sides.a} set={byLabel.get(sides.a)} />
            <SetLine side="B" label={sides.b} set={byLabel.get(sides.b)} />
          </dl>
        </Stack>
      </header>

      <ReportResults reportId={id} report={report} sides={sides} />
    </Stack>
  );
}
