import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { z } from 'zod';

const POSTS_DIR = path.join(process.cwd(), 'content', 'posts');

export const PostFrontmatterSchema = z.object({
  title: z.string(),
  description: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be an ISO date (YYYY-MM-DD)'),
  /**
   * When the post was last materially revised. Absent on a post that has not
   * been revised since publication — it is not defaulted to `date`, because
   * "never revised" and "revised on the day it shipped" are different claims
   * and only the first one should leave `article:modified_time` unset.
   */
  updated: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be an ISO date (YYYY-MM-DD)')
    .optional(),
  tags: z.array(z.string().min(1)).default([]),
  /** Set `draft: true` to exclude the post from the production build. */
  draft: z.boolean().optional(),
});

export type PostFrontmatter = z.infer<typeof PostFrontmatterSchema>;

/** Throws with the offending filename and Zod's issue path on a parse failure. */
export function parseFrontmatter(data: unknown, fileName: string): PostFrontmatter {
  const result = PostFrontmatterSchema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid frontmatter in ${fileName}: ${issues}`);
  }
  return result.data;
}

export interface Post extends PostFrontmatter {
  slug: string;
  content: string;
  readingMinutes: number;
}

export interface PostSummary extends PostFrontmatter {
  slug: string;
  readingMinutes: number;
}

/** ~200 words per minute, rounded, minimum 1. */
function estimateReadingMinutes(markdown: string): number {
  const words = markdown.trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 200));
}

function isPublished(fm: PostFrontmatter): boolean {
  // Drafts are visible in development, hidden in production.
  return process.env.NODE_ENV === 'development' || fm.draft !== true;
}

function readPostFile(fileName: string): Post {
  const slug = fileName.replace(/\.mdx?$/, '');
  const raw = fs.readFileSync(path.join(POSTS_DIR, fileName), 'utf8');
  const { data, content } = matter(raw);
  const fm = parseFrontmatter(data, fileName);

  return {
    slug,
    title: fm.title,
    description: fm.description,
    date: fm.date,
    updated: fm.updated,
    tags: fm.tags,
    draft: fm.draft,
    content,
    readingMinutes: estimateReadingMinutes(content),
  };
}

export function getAllPosts(): PostSummary[] {
  if (!fs.existsSync(POSTS_DIR)) return [];

  return fs
    .readdirSync(POSTS_DIR)
    .filter((file) => /\.mdx?$/.test(file))
    .map(readPostFile)
    .filter(isPublished)
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(({ content: _content, ...summary }) => summary);
}

export function getPostBySlug(slug: string): Post | null {
  const candidates = [`${slug}.mdx`, `${slug}.md`];
  const fileName = candidates.find((file) => fs.existsSync(path.join(POSTS_DIR, file)));
  if (!fileName) return null;

  const post = readPostFile(fileName);
  return isPublished(post) ? post : null;
}

export interface TagSummary {
  /** What `/tags/[tag]` carries. */
  slug: string;
  /** The tag as a post's frontmatter writes it, for the page's heading. */
  label: string;
}

/**
 * The URL form of a tag. Frontmatter carries display text — `visual regression`,
 * `CI` — and the route carries this; matching goes through it on both sides, so
 * `/tags/CI` and `/tags/ci` are one page rather than two.
 */
export function tagSlug(tag: string): string {
  return tag.trim().toLowerCase().replace(/\s+/g, '-');
}

/**
 * Where a tag chip points, given either its slug or the display text a post's
 * frontmatter writes. One page per slug, so this is the only href shape that
 * reaches a prerendered route.
 */
export function tagPath(tag: string): string {
  return `/tags/${tagSlug(tag)}`;
}

/** Every tag a published post carries, deduplicated by slug. */
export function getAllTags(): TagSummary[] {
  const tags = new Map<string, TagSummary>();
  getAllPosts().forEach((post) =>
    post.tags.forEach((tag) => {
      const slug = tagSlug(tag);
      // One slug can have several writings — `CI` and `ci`. First seen wins, and
      // `getAllPosts()` sorts newest first, so the newest post names the tag.
      if (!tags.has(slug)) tags.set(slug, { slug, label: tag });
    }),
  );
  return [...tags.values()].sort((a, b) => a.slug.localeCompare(b.slug));
}

/** Published posts carrying `tag`, given either its slug or its display text. */
export function getPostsByTag(tag: string): PostSummary[] {
  const slug = tagSlug(tag);
  return getAllPosts().filter((post) =>
    post.tags.some((postTag) => tagSlug(postTag) === slug),
  );
}

/** The display text behind a slug, or null when no published post carries it. */
export function getTagLabel(tag: string): string | null {
  const slug = tagSlug(tag);
  return getAllTags().find((candidate) => candidate.slug === slug)?.label ?? null;
}

export function formatDate(iso: string, locale = 'en-US'): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
