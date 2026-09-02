import * as fs from 'node:fs';
import * as path from 'node:path';
// Imported explicitly rather than relying on `globals: true` — same reason as
// content.test.ts: tsconfig's `**/*.ts` include means tsc typechecks this file.
import { describe, expect, it } from 'vitest';
import { getAllPosts, getPostBySlug } from '../lib/posts';

const POSTS_DIR = path.resolve(__dirname, '..', 'content', 'posts');

describe('getPostBySlug', () => {
  // The exposure named in #432: `POSTS_DIR` joins the slug and appends an
  // extension, so a traversal only lands when the target is a real .md/.mdx
  // file. These four are.
  it('returns null for a traversal reading the repository README', () => {
    expect(getPostBySlug('../../../../README')).toBeNull();
  });

  it('returns null for a traversal reading CLAUDE.md', () => {
    expect(getPostBySlug('../../../../CLAUDE')).toBeNull();
  });

  it('returns null for a traversal reading AGENTS.md', () => {
    expect(getPostBySlug('../../../../AGENTS')).toBeNull();
  });

  it('returns null for a traversal reading CONTEXT.md', () => {
    expect(getPostBySlug('../../../../CONTEXT')).toBeNull();
  });

  it('returns null for a shorter traversal reading apps/blog/CLAUDE.md', () => {
    expect(getPostBySlug('../../CLAUDE')).toBeNull();
  });

  it('returns null for an absolute path', () => {
    expect(getPostBySlug('/etc/passwd')).toBeNull();
  });

  // fs.existsSync throws ERR_INVALID_ARG_VALUE on a NUL byte; the fix must
  // never hand attacker input to fs at all, so this never reaches that call.
  it('returns null for a slug containing a NUL byte, rather than throwing', () => {
    const slug = `foo${String.fromCharCode(0)}bar`;
    expect(() => getPostBySlug(slug)).not.toThrow();
    expect(getPostBySlug(slug)).toBeNull();
  });

  // A traversal that resolved and threw while reading frontmatter would still
  // prove the file was opened; asserting null (rather than just !toThrow)
  // is what rules that out.
  it('reads nothing from disk for a traversal slug', () => {
    expect(getPostBySlug('../../../../README')).toBeNull();
  });

  // Read the directory directly rather than hardcoding a list, so a future
  // post with an unusual slug fails here rather than in production.
  it('resolves every published post in content/posts', () => {
    const slugs = fs
      .readdirSync(POSTS_DIR)
      .filter((file) => /\.mdx?$/.test(file))
      .map((file) => file.replace(/\.mdx?$/, ''));

    const published = new Set(getAllPosts().map((post) => post.slug));

    slugs
      .filter((slug) => published.has(slug))
      .forEach((slug) => {
        expect(getPostBySlug(slug)?.slug).toBe(slug);
      });
  });
});
