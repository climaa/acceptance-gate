'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { EmptyState, Stack } from '@gate/ui';
import { useReportKeys } from '@/hooks/useReportKeys';
import { useReviewMarks } from '@/hooks/useReviewMarks';
import {
  comparableVariants,
  type ComparisonMode,
  DEFAULT_MODE,
  isComparisonMode,
  variantByParam,
} from '@/lib/comparison';
import {
  A11Y_SECTION,
  buildSections,
  cardMatches,
  cardReviewed,
  countReviewed,
  EMPTY_UNCHANGED,
  filterByBucket,
  type ReportCard,
  type ReportSection,
  sectionViewportNote,
  type ReportSides,
} from '@/lib/report-view';
import {
  BUCKETS,
  type Bucket,
  reviewableCount,
  type Summary,
  type Variant,
} from '@/lib/summary';
import { BucketChipRow } from './BucketChipRow';
import { ComparisonModal } from './ComparisonModal';
import { ReviewBar } from './ReviewBar';
import { TierSection } from './TierSection';

/**
 * The review loop: the chip row, the bar, the corpus warnings and the sections
 * under them — everything on the report that changes while a reviewer works.
 *
 * Two kinds of state, kept deliberately apart:
 *
 *  - **Where you are** — the text filter, the bucket, whether reviewed cards are
 *    hidden — is in the URL, so a review position is a link someone can send.
 *    Read once through `useSearchParams()` and mirrored on every change; the
 *    page's `searchParams` prop is never touched, because this app runs with
 *    `cacheComponents: true` and reading it there would take the cached shell
 *    down with it.
 *  - **What you have judged** is in `localStorage` and nowhere else. It is one
 *    person keeping their place, never a fact about the run, so it is never
 *    written to the URL, to a cookie, or to the server.
 *
 * Which variant the comparison modal is on, and in which mode, is the first
 * kind: `story` and `mode` ride the same query string, so the exact pixels a
 * reviewer is looking at are a link they can send.
 *
 * The filters unmount cards rather than hiding them. A card that is display:none
 * is still a card a reviewer can be told they have seen.
 */

const A11Y_NOTE =
  'outranks the pixel verdict — an accessibility failure never folds into changed or unchanged, whatever its pixels did';

const NOTHING_MATCHES =
  'No story matches this filter — clear the search box or pick another bucket.';

/** A clean run writes no variants at all: `buildSummary` keeps only the counts
 *  of what matched. An empty report is a verdict, not an empty filter. */
const NOTHING_MOVED =
  'Nothing moved — every variant matched its baseline, so the run wrote no rows to review.';

interface ReportView {
  filter: string;
  bucket: Bucket | null;
  hideReviewed: boolean;
  /** The variant the comparison modal is open on — its key, which is also the
   *  stem of the shot filenames. Null closes it. */
  story: string | null;
  mode: ComparisonMode | null;
}

const isBucket = (value: string | null): value is Bucket =>
  BUCKETS.some((bucket) => bucket === value);

/** The review position this render was served with. */
function readView(params: URLSearchParams): ReportView {
  const bucket = params.get('bucket');
  const mode = params.get('mode');

  return {
    filter: params.get('filter') ?? '',
    bucket: isBucket(bucket) ? bucket : null,
    hideReviewed: params.get('hideReviewed') === '1',
    story: params.get('story'),
    mode: isComparisonMode(mode) ? mode : null,
  };
}

/** …and the same position, back as a query string. Defaults are left out, so a
 *  reviewer who has moved nothing shares the bare report URL. */
function toQuery({ filter, bucket, hideReviewed, story, mode }: ReportView): string {
  const params = new URLSearchParams();
  if (filter !== '') params.set('filter', filter);
  if (bucket) params.set('bucket', bucket);
  if (hideReviewed) params.set('hideReviewed', '1');
  if (story) params.set('story', story);
  if (story && mode) params.set('mode', mode);

  return params.toString();
}

/** The corpus-level notes the run recorded. Evidence rather than a toast: there
 *  is no way to dismiss it, because the reason a story went unstable is part of
 *  reading the report it appears in. */
function WarningStrip({ warnings }: { warnings: readonly string[] }) {
  if (warnings.length === 0) return null;

  return (
    <div role="note" aria-label="corpus warnings" className="vd-warnings">
      <ul className="vd-warnings__list">
        {warnings.map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
      </ul>
    </div>
  );
}

/** The review position, and the URL it is mirrored into. */
function useReportView(): [ReportView, (patch: Partial<ReportView>) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Seeded from the URL, then owned here: the reviewer's typing is the
  // authority for the rest of the visit, and the URL is what it writes to.
  const [view, setView] = useState<ReportView>(() => readView(params));

  const update = (patch: Partial<ReportView>) => {
    const next = { ...view, ...patch };
    setView(next);

    const query = toQuery(next);
    // `scroll: false` — the reviewer is reading a card halfway down; a filter
    // must not also send them back to the top.
    router.replace(query === '' ? pathname : `${pathname}?${query}`, { scroll: false });
  };

  return [view, update];
}

/** Why there is nothing under the bar — three different answers, and reading
 *  the wrong one as "your filter is too narrow" is how a passing run gets
 *  mistaken for a broken screen. */
function emptyMessage(view: ReportView, report: Summary): string {
  if (report.variants.length === 0) return NOTHING_MOVED;
  if (view.bucket === 'unchanged') return EMPTY_UNCHANGED;

  return NOTHING_MATCHES;
}

export interface ReportResultsProps {
  reportId: string;
  report: Summary;
  sides: ReportSides;
}

export function ReportResults({ reportId, report, sides }: ReportResultsProps) {
  const { marks, mark } = useReviewMarks(reportId);
  const [view, update] = useReportView();
  const [collapsed, setCollapsed] = useState<Readonly<Record<string, boolean>>>({});

  const sections = useMemo(
    // The whole run goes in as well as the filtered view: a card explains an
    // absent viewport against everything the run recorded, never against what
    // the chip row is currently showing.
    () => buildSections(filterByBucket(report.variants, view.bucket), report.variants),
    [report.variants, view.bucket],
  );

  // Every variant the report holds, filter or no filter: the bar reports on the
  // run, not on what is currently on screen.
  const reportKeys = report.variants.map((variant) => variant.key);

  const visible = sections
    .map((section) => ({
      section,
      cards: section.cards.filter(
        (card) =>
          cardMatches(card, view.filter) &&
          !(view.hideReviewed && cardReviewed(card, marks)),
      ),
    }))
    .filter((entry) => entry.cards.length > 0);

  // Document order, which is what `j`/`k` walk and what `n` searches forward in.
  const walkable = visible.flatMap((entry) =>
    collapsed[entry.section.key] ? [] : entry.cards,
  );

  // Every variant the modal can show, and the order ← → walks them in. Read
  // off the whole report rather than off `visible`: a shared link has to open
  // on the variant it names whatever bucket the recipient is filtered to, and
  // whatever their own browser has already marked reviewed.
  const comparable = useMemo(
    () => comparableVariants(report.variants),
    [report.variants],
  );
  const open = view.story === null ? null : variantByParam(comparable, view.story);

  const compare = (variant: Variant, mode: ComparisonMode) =>
    update({ story: variant.key, mode });

  const toggleCard = (card: ReportCard, reviewed: boolean) =>
    mark(
      card.variants.map((variant) => variant.key),
      reviewed,
    );
  const toggleSection = (section: ReportSection, reviewed: boolean) =>
    mark(section.variantKeys, reviewed);

  // The `n` key and the bar's button are the same walk, so the hook owns both.
  const { nextUnreviewed } = useReportKeys({
    cards: walkable,
    isReviewed: (card) => cardReviewed(card, marks),
    onToggle: toggleCard,
    // `b` opens the card's first variant — the producer sorted them worst
    // first, so that is the one the card is named after in the first place. An
    // a11y card opens nothing: its finding is not in the pixels, and a modal
    // framing two identical shots would say it was.
    onCompare: (card) => {
      const [first] = card.variants;
      if (card.bucket !== 'a11y' && first) compare(first, 'blink');
    },
    enabled: open === null,
  });

  const allCollapsed =
    sections.length > 0 && sections.every((section) => collapsed[section.key]);
  const collapseAll = (next: boolean) =>
    setCollapsed(Object.fromEntries(sections.map((section) => [section.key, next])));

  return (
    <Stack gap={5}>
      <BucketChipRow
        counts={report.counts}
        selected={view.bucket}
        onSelect={(bucket) => update({ bucket })}
      />

      <ReviewBar
        filter={view.filter}
        onFilter={(filter) => update({ filter })}
        hideReviewed={view.hideReviewed}
        onHideReviewed={(hideReviewed) => update({ hideReviewed })}
        reviewed={countReviewed(reportKeys, marks)}
        total={reviewableCount(report.counts)}
        onNextUnreviewed={nextUnreviewed}
        allCollapsed={allCollapsed}
        onCollapseAll={collapseAll}
      />

      <WarningStrip warnings={report.warnings} />

      <Stack gap={6}>
        {visible.map(({ section, cards }) => (
          <TierSection
            key={section.key}
            reportId={reportId}
            section={section}
            cards={cards}
            sides={sides}
            reviewed={marks}
            note={section.name === A11Y_SECTION ? A11Y_NOTE : undefined}
            viewportNote={sectionViewportNote(section)}
            collapsed={collapsed[section.key] ?? false}
            onCollapse={(next) =>
              setCollapsed((current) => ({ ...current, [section.key]: next }))
            }
            onToggleSection={toggleSection}
            onToggleCard={toggleCard}
            onCompare={compare}
          />
        ))}

        {visible.length === 0 && <EmptyState message={emptyMessage(view, report)} />}
      </Stack>

      {open && (
        <ComparisonModal
          reportId={reportId}
          variant={open}
          variants={comparable}
          sides={sides}
          mode={view.mode ?? DEFAULT_MODE}
          onMode={(mode) => update({ mode })}
          onVariant={(next) => update({ story: next.key })}
          onClose={() => update({ story: null, mode: null })}
        />
      )}
    </Stack>
  );
}
