import * as fs from 'node:fs';
import * as path from 'node:path';
import { compile, run } from '@mdx-js/mdx';
import matter from 'gray-matter';
import { createElement } from 'react';
import * as runtime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
// Imported explicitly rather than relying on `globals: true`: this file sits
// inside tsconfig's `**/*.ts` include, so tsc typechecks it and the globals
// would otherwise be untyped (TS2582).
import { describe, expect, it } from 'vitest';
import { mdxComponents, rehypePlugins } from '../lib/mdx';
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
    // Compiled with the real pipeline, not bare: the plugins run over every
    // fence and every heading in the post, so a construct one of them chokes on
    // is a failed build, and only this suite sees it while the post is a draft.
    it('compiles as MDX', async () => {
      await expect(compile(post.content, { rehypePlugins })).resolves.toBeDefined();
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

/**
 * The rehype pipeline the post page hands to `MDXRemote`.
 *
 * Asserted on rendered markup rather than on the plugin objects, because the
 * three plugins, the `pre` override and `CodeBlock` only ever meet there — a
 * config that reads right and renders a bare `<pre>` is exactly the failure
 * this block exists to catch. `@mdx-js/mdx` is what `next-mdx-remote` runs
 * underneath, so this is the build's own output, not a proxy for it.
 *
 * What the highlighted markup LOOKS like stays the differ's, per
 * CODING_STANDARDS — nothing here asserts a colour, a size or a ratio.
 */
describe('rehype pipeline', () => {
  // One fence and one heading, reused by the cases that only differ in what
  // they assert about the same render.
  const TS_FENCE = '```ts\nconst answer = 42;\n```\n';
  const HEADING = '## Why the gate exists\n';

  async function renderMdx(source: string): Promise<string> {
    const compiled = await compile(source, {
      outputFormat: 'function-body',
      rehypePlugins,
    });
    const { default: Content } = await run(compiled, runtime);

    return renderToStaticMarkup(createElement(Content, { components: mdxComponents }));
  }

  it('highlights a fenced code block at build time', async () => {
    const html = await renderMdx(TS_FENCE);

    expect(html).toMatch(
      /<span style="--shiki-light:[^"]+;--shiki-dark:[^"]+">const<\/span>/,
    );
  });

  it('lands the highlighted markup inside CodeBlock', async () => {
    const html = await renderMdx(TS_FENCE);

    expect(html).toContain('class="ds-code"');
    expect(html).toContain('data-language="ts"');
  });

  // CodeBlock supplies its own <code>; rehype-pretty-code supplies one too.
  // Rendering both nests one inside the other and double-styles the slab.
  it('emits exactly one code element per block', async () => {
    const html = await renderMdx(TS_FENCE);

    expect(html.match(/<code[\s>]/g)).toHaveLength(1);
  });

  // rehype-pretty-code wraps every block in <figure>, whose UA margin-inline of
  // 40px indents the slab inside .ds-prose. There is no caption to earn it.
  it('drops the highlighter figure wrapper', async () => {
    const html = await renderMdx(TS_FENCE);

    expect(html).not.toContain('<figure');
  });

  // Inline code is a chip in the prose, not a slab: `pre` is the override, and
  // overriding `code` instead would wrap every mention of a function name in
  // one. The chip's own styling is `.ds-prose code`'s.
  it('leaves inline code as an inline chip', async () => {
    const source = 'Call `getAllPosts()` first.\n';

    const html = await renderMdx(source);

    expect(html).toContain('<code>getAllPosts()</code>');
    expect(html).not.toContain('ds-code');
  });

  it('gives a heading an id that slugs its text', async () => {
    const html = await renderMdx(HEADING);

    expect(html).toContain('<h2 id="why-the-gate-exists">');
  });

  // The edge case: ids must stay unique or every duplicate anchor lands on the
  // first heading, and the ids must stay stable across runs or every published
  // deep link rots on the next build.
  it('gives two headings with identical text distinct ids', async () => {
    const source = '## Trade-offs\n\nOne.\n\n## Trade-offs\n\nTwo.\n';

    const html = await renderMdx(source);

    expect(html).toContain('<h2 id="trade-offs">');
    expect(html).toContain('<h2 id="trade-offs-1">');
  });

  it('appends an anchor pointing back at its own heading', async () => {
    const html = await renderMdx(HEADING);

    expect(html).toContain('href="#why-the-gate-exists"');
  });

  // A link whose only content is "#" announces as "number sign, link". The
  // hidden label names the destination; the symbol is decoration.
  it('names the anchor for assistive tech rather than announcing a bare symbol', async () => {
    const html = await renderMdx(HEADING);

    expect(html).toContain('class="ds-visually-hidden">Link to Why the gate exists<');
    expect(html).toMatch(/aria-hidden="true"[^>]*>#</);
  });

  // CODING_STANDARDS: [data-theme] is the only theme mechanism — never
  // prefers-color-scheme, which is invisible to Storybook and to the differ.
  // The highlighter is deliberately dual-theme (--shiki-light/--shiki-dark
  // per token, wired to [data-theme='dark'] in CodeBlock.css), so what this
  // guards is narrower than "no --shiki at all": no media query smuggles the
  // choice in, and both palettes are genuinely present and different rather
  // than one theme id duplicated into both slots.
  it('carries both light and dark token colours without reading the OS colour scheme', async () => {
    const html = await renderMdx(TS_FENCE);

    expect(html).not.toContain('prefers-color-scheme');
    expect(html).toContain('--shiki-light:');
    expect(html).toContain('--shiki-dark:');

    const [, lightValue, darkValue] =
      html.match(/--shiki-light:([^;"]+);--shiki-dark:([^;"]+)"/) ?? [];
    expect(lightValue).toBeDefined();
    expect(darkValue).toBeDefined();
    expect(lightValue).not.toBe(darkValue);
  });

  // Named here rather than imported from lib/mdx.tsx: an expectation that reads
  // the list it guards cannot catch a package leaving it.
  const PINNED_PIPELINE_PACKAGES = [
    'rehype-pretty-code',
    'rehype-slug',
    'rehype-autolink-headings',
    'shiki',
  ] as const;

  const EXACT_VERSION = /^\d+\.\d+\.\d+$/;

  // Shiki's token markup is the differ's baseline in Wave 4. A caret range lets
  // a fresh install rewrite every code block on a machine nobody touched, which
  // is a mass rebaseline dressed up as a lockfile refresh.
  it('pins the highlighter and its plugins to exact versions', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf8'),
    ) as { dependencies: Record<string, string | undefined> };

    const unpinned = PINNED_PIPELINE_PACKAGES.filter(
      (name) => !EXACT_VERSION.test(manifest.dependencies[name] ?? ''),
    );

    expect(unpinned).toEqual([]);
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
