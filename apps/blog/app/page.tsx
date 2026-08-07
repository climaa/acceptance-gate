import Link from 'next/link';
import { Badge, Card, Stack } from '@gate/ui';
import { formatDate, getAllPosts } from '@/lib/posts';

export default function HomePage() {
  const posts = getAllPosts().slice(0, 4);

  return (
    <Stack gap={12}>
      <Stack gap={4} as="section">
        <h1 className="hero__title">I build frontends you can verify.</h1>
        <p className="hero__lead">
          Web developer in Barcelona. Next.js, TypeScript and one specific obsession: that
          quality is a property of the pipeline, not a phase at the end. I write about
          Cypress with Gherkin, visual regression, and what changes when agents write part
          of the code.
        </p>
      </Stack>

      <Stack gap={5} as="section">
        <h2 className="section-title">Latest posts</h2>

        {posts.length === 0 ? (
          <p className="post-card__desc">No posts published yet.</p>
        ) : (
          <Stack gap={3}>
            {posts.map((post) => (
              <Card key={post.slug} interactive>
                <Link href={`/blog/${post.slug}`} className="post-card__link">
                  <Stack gap={2}>
                    <h3 className="post-card__title">{post.title}</h3>
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
        )}
      </Stack>
    </Stack>
  );
}
