import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MDXRemote } from 'next-mdx-remote/rsc';
import { Badge, Prose, Stack } from '@gate/ui';
import { formatDate, getAllPosts, getPostBySlug } from '@/lib/posts';

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
    <article>
      <Stack gap={8}>
        <header className="article-header">
          <Stack gap={3}>
            <h1 className="article-header__title">{post.title}</h1>
            <div className="post-meta">
              <span>{formatDate(post.date)}</span>
              <span>·</span>
              <span>{post.readingMinutes} min de lectura</span>
            </div>
            <Stack direction="row" gap={2} wrap>
              {post.tags.map((tag) => (
                <Badge key={tag} tone="accent">
                  {tag}
                </Badge>
              ))}
            </Stack>
          </Stack>
        </header>

        <Prose>
          <MDXRemote source={post.content} />
        </Prose>
      </Stack>
    </article>
  );
}
