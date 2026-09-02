import * as fs from 'node:fs';
import * as path from 'node:path';
// Imported explicitly rather than relying on `globals: true` — same reason as
// content.test.ts: tsconfig's `**/*.ts` include means tsc typechecks this file.
import { describe, expect, it } from 'vitest';
import { getAllPosts, getPostBySlug } from '../lib/posts';

const POSTS_DIR = path.resolve(__dirname, '..', 'content', 'posts');

/**
 * `POSTS_DIR` joins the slug and appends an extension, so a traversal only
 * lands when the target is a real `.md`/`.mdx` file. These are, which is what
 * makes them the cases worth pinning rather than, say, `../../package.json`.
 *
 * The assertion is `null`, never merely "does not throw": a traversal that
 * resolved and then threw while parsing frontmatter would still have opened
 * the file, and only the returned value rules that out.
 */
const TRAVERSAL_TARGETS = [
  { slug: '../../../../README', reads: 'the repository README' },
  { slug: '../../../../CLAUDE', reads: 'CLAUDE.md' },
  { slug: '../../../../AGENTS', reads: 'the routing table' },
  { slug: '../../../../CONTEXT', reads: 'the glossary' },
  // A shorter hop than the four above, and a different target.
  { slug: '../../CLAUDE', reads: "apps/blog's own CLAUDE.md" },
];

describe('getPostBySlug', () => {
  it.each(TRAVERSAL_TARGETS)(
    'returns null for a traversal reading $reads',
    ({ slug }) => {
      expect(getPostBySlug(slug)).toBeNull();
    },
  );

  it('returns null for an absolute path', () => {
    expect(getPostBySlug('/etc/passwd')).toBeNull();
  });

  // A NUL byte reaches the two fs calls differently — `existsSync` swallows it
  // into `false`, `readFileSync` throws ERR_INVALID_ARG_VALUE — so a slug this
  // shape has to be rejected outright rather than left to whichever call sees
  // it first.
  it('returns null for a slug containing a NUL byte, rather than throwing', () => {
    const slug = `foo${String.fromCharCode(0)}bar`;

    expect(getPostBySlug(slug)).toBeNull();
  });

  // Read from the directory rather than a hardcoded list, so a future post with
  // an unusual slug fails here rather than in production. Drafts are dropped:
  // NODE_ENV is `test` under vitest, so `getAllPosts()` already hides them, and
  // `getPostBySlug` returns null for them too.
  it('resolves every published post in content/posts', () => {
    const published = fs
      .readdirSync(POSTS_DIR)
      .filter((file) => /\.mdx?$/.test(file))
      .map((file) => file.replace(/\.mdx?$/, ''))
      .filter((slug) => getAllPosts().some((post) => post.slug === slug));

    const resolved = published.map((slug) => getPostBySlug(slug)?.slug);

    // A silently empty list would pass forever while protecting nothing.
    expect(published.length).toBeGreaterThan(0);
    expect(resolved).toEqual(published);
  });
});
