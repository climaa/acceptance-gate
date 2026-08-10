import { OG_CONTENT_TYPE, OG_SIZE, ogImageResponse, postCardCopy } from '@/lib/og';
import { getAllPosts, getPostBySlug } from '@/lib/posts';
import { SITE_TITLE } from '@/lib/site';

interface ImageProps {
  params: Promise<{ slug: string }>;
}

// `alt` is a static export in the metadata file convention — it cannot read the
// slug, so it describes the card rather than quoting the title it draws.
export const alt = `Post preview — ${SITE_TITLE}`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

// Mirrors page.tsx: the card prerenders alongside the post it belongs to,
// rather than on the first crawler request after a deploy. Next invokes this by
// convention, so nothing imports it; fallow's nextjs plugin allowlists the
// convention for page.tsx but not for metadata files, hence the suppression.
// fallow-ignore-next-line unused-export
export function generateStaticParams() {
  return getAllPosts().map((post) => ({ slug: post.slug }));
}

export default async function Image({ params }: ImageProps) {
  const { slug } = await params;

  return ogImageResponse(postCardCopy(getPostBySlug(slug)));
}
