'use client';

import { useRouter } from 'next/navigation';
import type { Bucket } from '@/lib/summary';
import { BucketChipRow } from './BucketChipRow';

/**
 * A report's verdict on the console, before the report is opened.
 *
 * The same chip row the report page draws, so the counts look the same in both
 * places. On the report a chip filters; here it opens the report already
 * filtered to that bucket, through the same `?bucket=` the report reads back.
 * `total` opens the report unfiltered.
 */
export function reportHref(id: string, bucket: Bucket | null): string {
  return bucket === null ? `/report/${id}` : `/report/${id}?bucket=${bucket}`;
}

export interface ReportBucketsProps {
  id: string;
  counts: Record<Bucket, number>;
}

export function ReportBuckets({ id, counts }: ReportBucketsProps) {
  const router = useRouter();

  return (
    <BucketChipRow
      counts={counts}
      selected={null}
      onSelect={(bucket) => router.push(reportHref(id, bucket))}
    />
  );
}
