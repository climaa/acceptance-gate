import type { PostSummary } from '@/lib/posts';

/** The article the post page is drawn for: the shortest of the six. */
export const SAMPLE_ARTICLE: PostSummary = {
  slug: 'visual-regression-with-agents',
  title: 'Visual regression with agents: the pixel diff is no longer enough',
  description:
    'Why traditional snapshot testing breaks down when part of the code is written by an agent, and what strategy replaces it.',
  date: '2026-08-05',
  tags: ['testing', 'visual regression', 'agents'],
  readingMinutes: 6,
};

/**
 * Six of the blog's posts as the index lists them, newest first. Written out
 * rather than read from `content/`, which a story rendering in a browser cannot
 * open, and frozen here so that publishing a post changes the blog, not every
 * screen's baseline. Six, so the index runs to a second page.
 */
export const SAMPLE_POSTS: readonly PostSummary[] = [
  {
    slug: 'the-bump-that-merged-itself',
    title: 'The bump that merged itself, and the ten that did not',
    description:
      'A dependency bot opened sixteen pull requests against this repo. Three merged themselves unattended. What makes that defensible is not the pipeline that said yes, but the three refusals that had to be written down first.',
    date: '2026-08-27',
    tags: ['ci', 'automation', 'quality'],
    readingMinutes: 13,
  },
  {
    slug: 'what-is-sandcastle',
    title: 'What is Sandcastle — and why does this repo build itself?',
    description:
      'The autonomous orchestrator that lives in .sandcastle/ plans, implements, reviews and merges GitHub issues while I am away from the keyboard.',
    date: '2026-08-19',
    tags: ['sandcastle', 'agents', 'orchestration', 'quality'],
    readingMinutes: 10,
  },
  {
    slug: 'gherkin-specs-that-survive',
    title: 'Cypress and Gherkin: specs an agent can maintain',
    description:
      'How to write Gherkin features that act as an executable contract instead of becoming a layer of indirection nobody reads.',
    date: '2026-08-13',
    tags: ['cypress', 'gherkin', 'testing', 'e2e'],
    readingMinutes: 15,
  },
  {
    slug: 'the-migration-that-passed-ci',
    title: 'The migration that passed CI and broke the app',
    description:
      'A design-system major bump compiled cleanly, passed every unit test, and shipped a primary button at 1.06:1 contrast.',
    date: '2026-08-09',
    tags: ['mantine', 'design systems', 'visual regression', 'migration'],
    readingMinutes: 9,
  },
  {
    slug: 'the-guardrail-you-can-switch-off',
    title: 'The guardrail you can switch off',
    description:
      'A branch protection rule blocked two merges to main in one afternoon. Both times it caught the assistant, never the autonomous agent.',
    date: '2026-08-07',
    tags: ['agents', 'ci', 'git'],
    readingMinutes: 8,
  },
  SAMPLE_ARTICLE,
];

/** The tag the tag page is drawn for, and the posts that carry it. */
export const SAMPLE_TAG = 'agents';

export const SAMPLE_TAGGED_POSTS = SAMPLE_POSTS.filter((post) =>
  post.tags.includes(SAMPLE_TAG),
);
