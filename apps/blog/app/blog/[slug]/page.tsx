import type { Metadata } from 'next';
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
      tags: post.tags,
    },
  };
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
      <MDXRemote
        source={post.content}
        options={mdxRemoteOptions}
        components={mdxComponents}
      />
    </PostTemplate>
  );
}
