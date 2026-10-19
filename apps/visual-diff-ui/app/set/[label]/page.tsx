import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { EmptyState, Skeleton, Stack } from '@gate/ui';
import { SetTemplate } from '@/components/SetTemplate';
import { CANONICAL_LABEL, readCanonicalSet } from '@/lib/baselines';
import { readSets, resolveDataDir } from '@/lib/data';
import { repoRoot } from '@/lib/git';
import { SetLabelSchema } from '@/lib/job-contract';
import { readSetShots, setFilterFrom } from '@/lib/set-shots';
import { pageMetadata } from '@/lib/share';
import { setHref } from '@/lib/shots';
import { NOT_FOUND_TITLE } from '@/lib/site';

/**
 * The set route: one screenshot set, read and handed to the template.
 *
 * The third route on this console, and the one that answers a question the other
 * two could not: a report needs two sets and a set needs a capture, so a fresh
 * checkout — which has captured nothing — had no way to look at the corpus every
 * pull request is judged against.
 */

/** The label is the page's `<h1>`, so it is the `<title>` too, and the root
 *  layout's `%s · visual-diff console` template wraps it. Validated for the same
 *  reason the report route validates its id: a title is the part of a miss a
 *  reader keeps, in a tab strip and in their history. A label that passes
 *  previews under it too, at the set's own address. */
export async function generateMetadata({
  params,
}: PageProps<'/set/[label]'>): Promise<Metadata> {
  const { label } = await params;
  if (!SetLabelSchema.safeParse(label).success) return { title: NOT_FOUND_TITLE };

  return pageMetadata({
    path: setHref(label),
    title: label,
    description: `Screenshot set ${label}: every screenshot it holds, by tier, viewport and theme.`,
  });
}

export default function SetPage({ params, searchParams }: PageProps<'/set/[label]'>) {
  return (
    <Stack gap={6}>
      {/* `params` is request data and the shots are read per request, so the
          whole body is a dynamic hole — awaited inside the boundary, never above
          it, or the route would have no static shell at all. `searchParams` is
          awaited in the same hole, for the same reason: the filter a link names
          is checked on the server, so a shared view opens filtered on first
          paint, with or without JavaScript. */}
      <Suspense fallback={<Skeleton lines={4} />}>
        <SetContents params={params} searchParams={searchParams} />
      </Suspense>
    </Stack>
  );
}

async function SetContents({
  params,
  searchParams,
}: Pick<PageProps<'/set/[label]'>, 'params' | 'searchParams'>) {
  const { label } = await params;
  const filter = setFilterFrom(await searchParams);
  const { dir } = await resolveDataDir();
  const root = repoRoot();

  const [shots, registry, corpus] = await Promise.all([
    readSetShots(dir, root, label),
    readSets(dir),
    readCanonicalSet(root),
  ]);

  // The one miss that is not a 404. An instance with no checkout behind it has
  // no committed corpus to offer — lib/baselines.ts is explicit that it "says
  // nothing rather than inventing one" — and answering 404 would claim the
  // corpus never existed rather than that it is not reachable from here.
  if (!shots && label === CANONICAL_LABEL) {
    return (
      <EmptyState message="This instance has no checkout behind it, so there is no committed corpus to browse. The corpus lives in the repository, not in this console's data directory." />
    );
  }

  // Everything else lands the same way: a label that is not one, a set this
  // instance does not hold, and a set holding no shots. lib/paths.ts says why
  // they are not told apart.
  if (!shots) notFound();

  return (
    <SetTemplate
      corpus={shots.isCanonical ? corpus : null}
      set={registry.sets.find((entry) => entry.label === label) ?? null}
      shots={shots}
      filter={filter}
    />
  );
}
