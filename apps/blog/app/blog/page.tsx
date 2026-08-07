import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge, Card, Stack } from '@gate/ui';
import { formatDate, getAllPosts } from '@/lib/posts';

export const metadata: Metadata = {
  title: 'Blog',
  description: 'Posts on frontend, automated testing and coding agents.',
};

export default function BlogIndexPage() {
  const posts = getAllPosts();

  return (
    <Stack gap={8}>
      <h1 className="article-header__title">Blog</h1>

      <Stack gap={3}>
        {posts.map((post) => (
          <Card key={post.slug} interactive>
            <Link href={`/blog/${post.slug}`} className="post-card__link">
              <Stack gap={2}>
                <h2 className="post-card__title">{post.title}</h2>
                <p className="post-card__desc">{post.description}</p>
                <div className="post-meta">
                  <span>{formatDate(post.date)}</span>
                  <span>·</span>
                  <span>{post.readingMinutes} min</span>
                </div>
                <Stack direction="row" gap={2} wrap>
                  {post.tags.map((tag) => (
                    <Badge key={tag} tone="accent">
                      {tag}
                    </Badge>
                  ))}
                </Stack>
              </Stack>
            </Link>
          </Card>
        ))}
      </Stack>
    </Stack>
  );
}
