import Link from 'next/link';
import { Badge, Card, Stack } from '@gate/ui';
import { formatDate, getAllPosts } from '@/lib/posts';

export default function HomePage() {
  const posts = getAllPosts().slice(0, 4);

  return (
    <Stack gap={12}>
      <Stack gap={4} as="section">
        <h1 className="hero__title">Construyo frontend que se puede verificar.</h1>
        <p className="hero__lead">
          Desarrollador web en Barcelona. Next.js, TypeScript y una obsesión concreta: que
          la calidad sea una propiedad del pipeline, no una fase al final. Escribo sobre
          Cypress con Gherkin, regresión visual y qué cambia cuando los agentes escriben
          parte del código.
        </p>
      </Stack>

      <Stack gap={5} as="section">
        <h2 className="section-title">Últimos artículos</h2>

        {posts.length === 0 ? (
          <p className="post-card__desc">Todavía no hay artículos publicados.</p>
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
