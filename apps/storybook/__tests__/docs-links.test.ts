// @vitest-environment jsdom
//
// jsdom rather than the suite's node default: this imports ../.storybook/preview
// to read the real sidebar order, and that module pulls in addon-docs blocks.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { toId } from 'storybook/internal/csf';
import { describe, expect, it } from 'vitest';
import preview from '../.storybook/preview';

/**
 * A docs page's sidebar path and its URL are the same string: Storybook derives
 * the id from `<Meta title>`, so renaming a page silently invalidates every
 * `?path=/docs/...` link pointing at it. Nothing else in the repo checks those —
 * not lint, not the build, not CI — and a dead one only shows up as Storybook's
 * "story not found" screen, in the blog's case to a reader rather than to us.
 *
 * The ids here are derived with Storybook's own `toId`, not a local regex, so
 * the rule cannot drift from the one the manager actually applies.
 */

const STORYBOOK_DIR = path.resolve(import.meta.dirname, '..');
const REPO_ROOT = path.resolve(STORYBOOK_DIR, '..', '..');
const DOCS_DIR = path.join(STORYBOOK_DIR, 'src', 'docs');
const BLOG_POSTS_DIR = path.join(REPO_ROOT, 'apps', 'blog', 'content', 'posts');

const mdxFilesIn = (dir: string) =>
  fs
    .readdirSync(dir, { recursive: true })
    .filter((entry): entry is string => typeof entry === 'string')
    .filter((entry) => entry.endsWith('.mdx'))
    .map((entry) => path.join(dir, entry));

/** Every unattached MDX doc renders under the name `Docs`; only the title varies. */
const DOCS_STORY_NAME = 'Docs';
const META_TITLE = /<Meta\s+title="([^"]+)"/;
const DOCS_LINK = /\?path=\/docs\/([a-z0-9-]+--docs)/g;

const docPages = mdxFilesIn(DOCS_DIR).map((file) => ({
  file: path.relative(REPO_ROOT, file),
  title: META_TITLE.exec(fs.readFileSync(file, 'utf8'))?.[1],
}));

const linkSources = [
  ...mdxFilesIn(DOCS_DIR),
  ...mdxFilesIn(BLOG_POSTS_DIR),
  path.join(STORYBOOK_DIR, 'vercel.json'),
].map((file) => ({
  file: path.relative(REPO_ROOT, file),
  links: [...fs.readFileSync(file, 'utf8').matchAll(DOCS_LINK)].flatMap(
    ([, id]) => id ?? [],
  ),
}));

describe('every docs page declares a title', () => {
  it.each(docPages)('$file', ({ title }) => {
    expect(title).toMatch(/^Docs\//);
  });
});

/** Narrowed rather than cast: an untitled page is already a failure above, and
 *  dropping it here keeps that one failure from cascading into every other case. */
const titles = docPages.flatMap(({ title }) => title ?? []);
const knownIds = new Set(titles.map((title) => toId(title, DOCS_STORY_NAME)));

describe('every ?path=/docs/ link resolves to a page that exists', () => {
  // Files with no links at all still get a case, so the suite reports which
  // files were searched rather than silently covering a shrinking set.
  it.each(linkSources)('$file', ({ links }) => {
    expect(links.filter((id) => !knownIds.has(id))).toEqual([]);
  });
});

/** storySort nests as `'Folder', ['Child', ...]` — a child array follows its
 *  parent rather than nesting inside it, so a leaf is a string with no array
 *  after it. Only leaves are real pages; folders exist to hold them. */
const leafPaths = (nodes: readonly unknown[], prefix: string[] = []): string[] =>
  nodes.flatMap((node, index) => {
    if (typeof node !== 'string') return [];

    const trail = [...prefix, node];
    const children = nodes[index + 1];

    return Array.isArray(children) ? leafPaths(children, trail) : [trail.join('/')];
  });

const ordered = leafPaths(
  (preview.parameters?.options as { storySort: { order: unknown[] } }).storySort.order,
);
const orderedDocs = ordered.filter((entry) => entry.startsWith('Docs/'));

describe('the sidebar order and the docs pages on disk agree', () => {
  // Both directions: an unlisted page falls back to alphabetical and lands in
  // the wrong place, a listed-but-missing page is a rename nobody finished.
  it.each(titles)('%s is placed by storySort', (title) => {
    expect(orderedDocs).toContain(title);
  });

  it('storySort lists no docs page that does not exist', () => {
    expect(orderedDocs.filter((entry) => !titles.includes(entry))).toEqual([]);
  });
});
