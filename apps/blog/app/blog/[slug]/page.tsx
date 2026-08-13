import type { Metadata } from 'next';
import { cacheLife } from 'next/cache';
import NextLink from 'next/link';
import { notFound } from 'next/navigation';
import { MDXRemote } from 'next-mdx-remote/rsc';
import { PostTemplate } from '@gate/ui';
import { mdxComponents, mdxRemoteOptions } from '@/lib/mdx';
import { getAllPosts, getPostBySlug, tagPath } from '@/lib/posts';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return getAllPosts().map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return {};

  return {
    title: post.title,
    description: post.description,
    openGraph: {
      type: 'article',
      title: post.title,
      description: post.description,
      publishedTime: post.date,
      // Omitted rather than mirrored from `date` when the post has never been
      // revised: an `article:modified_time` equal to the publish time tells a
      // reader nothing and is indistinguishable from a stale one.
      ...(post.updated ? { modifiedTime: post.updated } : {}),
      tags: post.tags,
    },
  };
}

/**
 * The highlighter reads the clock, so the body render is a cache boundary.
 *
 * Shiki's tokenizer (`@shikijs/vscode-textmate`) calls `Date.now()` as an
 * internal guard. The value never reaches the output, but under Cache
 * Components any clock read during a prerender is a build error — and it is not
 * ours to remove. `'use cache'` evaluates this once per cache key, which puts
 * the read inside a cached scope instead of the prerender.
 *
 * `'max'` because the input is a file on disk: the same source produces the
 * same HTML until the next deployment, which is exactly what the pipeline
 * already assumed when it ran every plugin at build time.
 */
async function PostBody({ source }: { source: string }) {
  'use cache';
  cacheLife('max');

  return (
    <MDXRemote source={source} options={mdxRemoteOptions} components={mdxComponents} />
  );
}

export default async function PostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  return (
    // The body is rendered here and handed over as children: MDXRemote and the
    // rehype pipeline are the app's, which is what keeps the template renderable
    // outside Next.
    <PostTemplate
      title={post.title}
      date={post.date}
      readingMinutes={post.readingMinutes}
      tags={post.tags}
      tagHref={tagPath}
      as={NextLink}
    >
      <PostBody source={post.content} />
    </PostTemplate>
  );
}
