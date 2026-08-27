import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { Skeleton, Stack } from '@gate/ui';
import { ReportTemplate } from '@/components/ReportTemplate';
import { readReport, readSets, resolveDataDir } from '@/lib/data';
import { ReportIdSchema } from '@/lib/job-contract';
import { NOT_FOUND_TITLE } from '@/lib/site';

/**
 * The report route: one comparison, read and handed to the template.
 *
 * The page resolves the data directory and awaits the readers, and does nothing
 * else — everything a reviewer touches is below, where it can be rendered from
 * literal rows without a filesystem.
 */

/**
 * The report id is the page's `<h1>` (components/ReportTemplate.tsx), so it is
 * the `<title>` too — the heading and the tab say the same sentence, and the
 * root layout's `%s · visual-diff console` template wraps it. Without this every
 * report tab read `visual-diff console` and a reviewer comparing two of them
 * side by side had no way to tell which was which.
 *
 * Reading `params` here defers the metadata to request time, which is free on
 * this route and would not be on another: the page below already awaits `params`
 * inside its `<Suspense>` and `resolveDataDir()` calls `connection()`, so the
 * head streams with content that was deferred anyway rather than turning an
 * otherwise-pre-render route dynamic.
 *
 * `ReportIdSchema` because a URL segment is not a report id until something says
 * so, and every other reader of one already asks: `proxy.ts` before it decides a
 * miss, `app/api/reports/[id]` before it reads or deletes. This was the single
 * consumer echoing the segment onward unchecked. React escapes it, so the stake
 * is not injection — it is that a title is the one part of a miss a reader keeps,
 * in a tab strip and in their history, and a malformed id has no business being
 * remembered as a report. Normally unreachable, since the proxy rewrites such a
 * segment to `/_not-found` first; this is what the page says when the proxy fails
 * open, which it does by design on a deployment shipped without a reports tree.
 */
export async function generateMetadata({
  params,
}: PageProps<'/report/[id]'>): Promise<Metadata> {
  const { id } = await params;

  return { title: ReportIdSchema.safeParse(id).success ? id : NOT_FOUND_TITLE };
}

export default function ReportPage({ params }: PageProps<'/report/[id]'>) {
  return (
    <Stack gap={6}>
      {/* `params` is request data and the summary is read per request, so the
          whole body is a dynamic hole — awaited inside the boundary, never
          above it, or the route would have no static shell at all. The review
          loop reads the query string under this same boundary, with
          `useSearchParams()`; the page's own `searchParams` prop is never
          touched, which is what keeps that shell cacheable. */}
      <Suspense fallback={<Skeleton lines={4} />}>
        <ReportContents params={params} />
      </Suspense>
    </Stack>
  );
}

async function ReportContents({ params }: Pick<PageProps<'/report/[id]'>, 'params'>) {
  const { id } = await params;
  const { dir } = await resolveDataDir();
  const [report, registry] = await Promise.all([readReport(dir, id), readSets(dir)]);

  // A report id that never existed, and one that climbed out of the data
  // directory, land here the same way: nothing to show, nothing to say about
  // why. lib/data.ts refuses the second before any file is opened.
  if (!report) notFound();

  return <ReportTemplate id={id} report={report} sets={registry.sets} />;
}
