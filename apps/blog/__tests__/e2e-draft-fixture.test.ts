import * as fs from 'node:fs';
import * as path from 'node:path';
import matter from 'gray-matter';
// Imported explicitly rather than relying on `globals: true` — same reason as
// content.test.ts: tsconfig's `**/*.ts` include means tsc typechecks this file.
import { describe, expect, it } from 'vitest';

/**
 * The one post whose CONTENT is a test fixture.
 *
 * `apps/e2e`'s "Drafts are not published" scenario asserts that no article on
 * the built index is titled `DRAFT_FIXTURE_TITLE`. That assertion is trivially
 * true against a site that never had such a post: delete this file, rename it,
 * publish it, or retitle it, and the scenario goes green while proving nothing
 * — with no diff anywhere near `apps/e2e/`, so nothing there can notice.
 *
 * No other suite here covers it. `content.test.ts` compiles every post including
 * drafts, but says nothing about which posts must exist. This one pins
 * existence, `draft: true` and the exact title string, at the layer that owns
 * the content.
 */

const FIXTURE = path.resolve(
  __dirname,
  '..',
  'content',
  'posts',
  'e2e-draft-fixture.mdx',
);

const E2E_STEPS = path.resolve(
  __dirname,
  '..',
  '..',
  'e2e',
  'steps',
  'acceptance',
  'blog.steps.ts',
);

/**
 * Duplicated rather than imported: `blog.steps.ts` imports `@playwright/test`
 * and `playwright-bdd` at module scope, and pnpm keeps each workspace's
 * dependencies to itself, so neither resolves from `apps/blog` — a type-only
 * import would still red `tsc` here. The last case below pins this copy to the
 * exported original character for character, so the two cannot drift.
 */
const DRAFT_FIXTURE_TITLE = 'Draft fixture — must never be published';

describe('e2e draft fixture', () => {
  it('exists', () => {
    expect(fs.existsSync(FIXTURE)).toBe(true);
  });

  it('is a draft', () => {
    const { data } = matter(fs.readFileSync(FIXTURE, 'utf8'));

    expect(data.draft).toBe(true);
  });

  it('carries the title the e2e scenario asserts against', () => {
    const { data } = matter(fs.readFileSync(FIXTURE, 'utf8'));

    expect(data.title).toBe(DRAFT_FIXTURE_TITLE);
  });

  // Read as source, not imported, for the reason above. A regex over one
  // exported literal is the whole coupling — it fails loudly if the constant is
  // renamed or inlined again, which is the point.
  it('matches DRAFT_FIXTURE_TITLE exported by the e2e step definition', () => {
    const source = fs.readFileSync(E2E_STEPS, 'utf8');

    const exported = source.match(
      /export const DRAFT_FIXTURE_TITLE\s*=\s*(['"])(.*?)\1/,
    )?.[2];

    expect(exported, `no exported DRAFT_FIXTURE_TITLE in ${E2E_STEPS}`).toBe(
      DRAFT_FIXTURE_TITLE,
    );
  });
});
