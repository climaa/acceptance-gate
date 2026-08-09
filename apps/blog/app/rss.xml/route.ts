import { getAllPosts } from '@/lib/posts';
import { absoluteUrl, SITE_DESCRIPTION, SITE_TITLE } from '@/lib/site';

// No request data is read, so the response is identical on every call —
// prerender it at build time like the rest of the site instead of on demand.
export const dynamic = 'force-static';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// pubDate is derived from frontmatter `date`, never Date.now() — a feed whose
// bytes change on every build defeats caching and any snapshot test.
function toPubDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toUTCString();
}

export function GET(): Response {
  const posts = getAllPosts();

  const items = posts
    .map((post) => {
      const url = absoluteUrl(`/blog/${post.slug}`);
      return `    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${url}</link>
      <description>${escapeXml(post.description)}</description>
      <pubDate>${toPubDate(post.date)}</pubDate>
      <guid>${url}</guid>
    </item>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(SITE_TITLE)}</title>
    <link>${absoluteUrl('/')}</link>
    <description>${escapeXml(SITE_DESCRIPTION)}</description>
${items}
  </channel>
</rss>
`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
    },
  });
}
