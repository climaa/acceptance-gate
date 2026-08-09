import * as fs from 'node:fs';
import * as path from 'node:path';
import { compile } from '@mdx-js/mdx';
import matter from 'gray-matter';
// Imported explicitly rather than relying on `globals: true`: this file sits
// inside tsconfig's `**/*.ts` include, so tsc typechecks it and the globals
// would otherwise be untyped (TS2582).
import { describe, expect, it } from 'vitest';
import { parseFrontmatter, PostFrontmatterSchema } from '../lib/posts';

/**
 * Compiles every post in content/posts, INCLUDING drafts.
 *
 * `next build` cannot do this. `lib/posts.ts` filters `draft: true` out via
 * `isPublished()` whenever NODE_ENV is production, so a draft is never handed
 * to MDXRemote and never compiled in CI — it compiles for the first time on
 * the commit that publishes it, which is the worst moment to discover a syntax
 * error. Reading the directory directly instead of calling `getAllPosts()` is
 * the entire point of this suite: `getAllPosts()` is the function that hides
 * drafts.
 *
 * `@mdx-js/mdx` is the compiler `next-mdx-remote` uses underneath, so a failure
 * here is a failure at build time. This is not a proxy for the real thing.
 */

const POSTS_DIR = path.resolve(__dirname, '..', 'content', 'posts');

const posts = fs
  .readdirSync(POSTS_DIR)
  .filter((f) => /\.mdx?$/.test(f))
  .map((file) => {
    const raw = fs.readFileSync(path.join(POSTS_DIR, file), 'utf8');
    const { data, content } = matter(raw);
    return { file, data: data as Record<string, unknown>, content, raw };
  });

describe('content/posts', () => {
  // A suite that silently matches zero files would pass forever while
  // protecting nothing — the failure mode this whole suite exists to prevent.
  it('finds posts to check', () => {
    expect(posts.length).toBeGreaterThan(0);
  });

  describe.each(posts.map((p) => [p.file, p] as const))('%s', (_file, post) => {
    it('compiles as MDX', async () => {
      await expect(compile(post.content)).resolves.toBeDefined();
    });

    // Prettier 3.x rewrites `{/* … */}` to `{/_ … _/}`, which is not a valid JS
    // expression — it broke the build once. `.prettierignore` carves these files
    // out now; this pins the reason so the carve-out is not "cleaned up" later.
    it('has no Prettier-mangled MDX comments', () => {
      expect(post.raw).not.toMatch(/\{\/_/);
    });

    it('has frontmatter matching PostFrontmatter', () => {
      expect(typeof post.data.title).toBe('string');
      expect(typeof post.data.description).toBe('string');
      expect(Array.isArray(post.data.tags)).toBe(true);
      if (post.data.draft !== undefined) {
        expect(typeof post.data.draft).toBe('boolean');
      }
    });

    // `lib/posts.ts` throws on any post the Zod schema rejects, so a real post
    // failing this assertion is the same failure the production build hits.
    it('passes PostFrontmatterSchema validation', () => {
      const result = PostFrontmatterSchema.safeParse(post.data);
      expect(result.success, result.error?.message).toBe(true);
    });

    // The slug comes from the filename, and lib/posts.ts sorts by this string,
    // so a malformed date silently reorders the index rather than erroring.
    it('has an ISO date', () => {
      expect(String(post.data.date)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(String(post.data.date)))).toBe(false);
    });

    // Checked against `raw` rather than `content` so the frontmatter `title`,
    // `description` and `tags` — all user-facing — are covered too. None of these
    // characters occurs in an English word, so a hit is untranslated prose.
    it('is written in English', () => {
      const spanish = post.raw.match(/[áéíóúüñÁÉÍÓÚÜÑ¿¡]/g);
      expect(spanish ?? []).toEqual([]);
    });

    // `{/* … */}` is a JSX expression comment: it renders to nothing, so a TODO
    // left in a published post is a silent gap on the live site rather than a
    // visible note. Drafts are exempt — there an author note is doing its job —
    // and `skipIf` keeps that exemption visible in the report.
    it.skipIf(post.data.draft === true)('ships no unrendered TODO placeholder', () => {
      expect(post.content).not.toMatch(/\{\/\*[\s\S]*?TODO[\s\S]*?\*\/\}/);
    });
  });
});

describe('parseFrontmatter', () => {
  const valid = {
    title: 'A valid post',
    description: 'A valid description',
    date: '2026-01-15',
    tags: ['testing'],
  };

  it('parses a valid frontmatter object', () => {
    expect(parseFrontmatter(valid, 'valid.mdx')).toEqual({ ...valid, draft: undefined });
  });

  it('throws naming the file when date is missing', () => {
    const { date: _date, ...withoutDate } = valid;
    expect(() => parseFrontmatter(withoutDate, 'no-date.mdx')).toThrow(/no-date\.mdx/);
  });

  it('throws when date is not YYYY-MM-DD', () => {
    expect(() =>
      parseFrontmatter({ ...valid, date: '01/15/2026' }, 'bad-date.mdx'),
    ).toThrow(/bad-date\.mdx/);
  });

  it('throws when tags is a bare string instead of an array', () => {
    expect(() =>
      parseFrontmatter({ ...valid, tags: 'testing' }, 'string-tags.mdx'),
    ).toThrow(/string-tags\.mdx/);
  });

  it('defaults draft to undefined when absent', () => {
    const fm = parseFrontmatter(valid, 'no-draft.mdx');
    expect(fm.draft).toBeUndefined();
  });

  it('carries draft through when present', () => {
    const fm = parseFrontmatter({ ...valid, draft: true }, 'draft.mdx');
    expect(fm.draft).toBe(true);
  });
});
