import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { TagScreen, tagTitle } from '@/components/TagScreen';
import { getAllTags, getPostsByTag, getTagLabel, tagPath } from '@/lib/posts';
import { pageMetadata, tagDescription } from '@/lib/share';

export function generateStaticParams() {
  return getAllTags().map(({ slug }) => ({ tag: slug }));
}

export async function generateMetadata({
  params,
}: PageProps<'/tags/[tag]'>): Promise<Metadata> {
  const { tag } = await params;
  const label = getTagLabel(tag);
  if (!label) return {};

  // `/tags/CI` and `/tags/visual%20regression` reach this page too, since the
  // match is on the slug. One page, so one URL for a crawler to index.
  return pageMetadata({
    path: tagPath(label),
    title: tagTitle(label),
    description: tagDescription(label, getPostsByTag(label)),
  });
}

export default async function TagPage({ params }: PageProps<'/tags/[tag]'>) {
  const { tag } = await params;
  const label = getTagLabel(tag);
  if (!label) notFound();

  return <TagScreen label={label} posts={getPostsByTag(label)} />;
}
