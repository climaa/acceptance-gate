import type { Metadata } from 'next';
import NextLink from 'next/link';
import { notFound } from 'next/navigation';
import { BlogIndexTemplate } from '@gate/ui';
import { getAllTags, getPostsByTag, getTagLabel, tagSlug } from '@/lib/posts';

interface PageProps {
  params: Promise<{ tag: string }>;
}

// The page's heading and its `<title>` are the same sentence, and a crawler that
// reads one against the other should not find two.
const tagTitle = (label: string) => `Posts tagged ${label}`;

const postCount = (total: number) => `${total} ${total === 1 ? 'post' : 'posts'}`;

export function generateStaticParams() {
  return getAllTags().map(({ slug }) => ({ tag: slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { tag } = await params;
  const label = getTagLabel(tag);
  if (!label) return {};

  return {
    title: tagTitle(label),
    description: `Every post tagged ${label}.`,
    // `/tags/CI` and `/tags/visual%20regression` reach this page too, since the
    // match is on the slug. One page, so one URL for a crawler to index.
    alternates: { canonical: `/tags/${tagSlug(label)}` },
  };
}

export default async function TagPage({ params }: PageProps) {
  const { tag } = await params;
  const label = getTagLabel(tag);
  // The tag set is built from published posts, so an unknown tag has no page —
  // rendering one would be an empty index for anything a reader types.
  if (!label) notFound();

  const posts = getPostsByTag(label);

  return (
    <BlogIndexTemplate
      title={tagTitle(label)}
      intro={postCount(posts.length)}
      posts={posts.map((post) => ({
        title: post.title,
        description: post.description,
        href: `/blog/${post.slug}`,
        date: post.date,
        readingMinutes: post.readingMinutes,
        tags: post.tags,
        as: NextLink,
      }))}
      // Unreachable while the tag set comes from the posts themselves, and kept
      // as the defensive slot the template exists to have filled: whatever makes
      // a known tag list nothing must not render a page with no explanation.
      empty={`No posts tagged ${label} yet.`}
    />
  );
}
