import { Suspense } from 'react';
import { ComparisonContents } from '@/components/ComparisonContents';

/**
 * A comparison opened from its report: the modal alone, over the report the
 * layout keeps mounted. A fallback of nothing, because the report is already
 * on screen and the dialog arriving a beat later is the honest picture of a
 * read still in flight.
 */
export default function InterceptedComparison({
  params,
}: PageProps<'/report/[id]/compare/[key]'>) {
  return (
    <Suspense fallback={null}>
      <ComparisonContents params={params} entry="report" />
    </Suspense>
  );
}
