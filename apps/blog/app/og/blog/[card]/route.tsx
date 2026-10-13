import { ogImageResponse, postCardCopy, postCardParam, slugOfCardParam } from '@/lib/og';
import { getAllPosts, getPostBySlug } from '@/lib/posts';

// Every published post's card prerenders alongside the post, rather than on the
// first crawler request after a deploy.
export function generateStaticParams() {
  return getAllPosts().map((post) => ({ card: postCardParam(post.slug) }));
}

/**
 * A card for an address with no published post is the site card, not an error.
 * The address is reachable from a link shared before a post was renamed or
 * unpublished, and a preview that already holds it should still show an image.
 */
export async function GET(
  _request: Request,
  { params }: RouteContext<'/og/blog/[card]'>,
) {
  const { card } = await params;
  const slug = slugOfCardParam(card);

  return ogImageResponse(postCardCopy(slug ? getPostBySlug(slug) : null));
}
