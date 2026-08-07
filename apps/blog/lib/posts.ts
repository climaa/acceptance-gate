import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

const POSTS_DIR = path.join(process.cwd(), 'content', 'posts');

export interface PostFrontmatter {
  title: string;
  description: string;
  /** ISO date — YYYY-MM-DD */
  date: string;
  tags: string[];
  /** Set `draft: true` to exclude the post from the production build. */
  draft?: boolean;
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
  const fm = data as PostFrontmatter;

  return {
    slug,
    title: fm.title,
    description: fm.description,
    date: fm.date,
    tags: fm.tags ?? [],
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

export function getAllTags(): string[] {
  const tags = new Set<string>();
  getAllPosts().forEach((post) => post.tags.forEach((tag) => tags.add(tag)));
  return [...tags].sort();
}

export function formatDate(iso: string, locale = 'en-US'): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
