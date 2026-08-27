// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.ts` include means tsc typechecks this file.
import { describe, expect, it } from 'vitest';
import { generateMetadata } from '../app/report/[id]/page';
import { APP_NAME, NOT_FOUND_TITLE } from '../lib/site';

/**
 * What a report's browser tab says.
 *
 * Every tab read `visual-diff console` until this existed, which is the one
 * screen where that matters: comparing two reports means two tabs, and two tabs
 * with the same name are not a comparison. The root layout's `%s · APP_NAME`
 * template had no page exercising it except the 404.
 */

const REPORT = 'main-2026-08-17__main-2026-08-13';

const titleFor = async (id: string) =>
  (
    await generateMetadata({
      params: Promise.resolve({ id }),
      searchParams: Promise.resolve({}),
    })
  ).title;

describe('generateMetadata for /report/[id]', () => {
  // The same string the page draws as its `<h1>` — heading and tab say one
  // sentence, which is the rule /tags/[tag] states on the blog side.
  it('names the report, so two open reports are told apart', async () => {
    const title = await titleFor(REPORT);

    expect(title).toBe(REPORT);
  });

  // The layout owns the suffix. A page that appended it here would produce
  // `… · visual-diff console · visual-diff console` once the template applied.
  it('leaves the app name to the layout template', async () => {
    const title = await titleFor(REPORT);

    expect(title).not.toContain(APP_NAME);
  });

  // It never reads the disk, so a WELL-FORMED id that names nothing still titles
  // the tab rather than throwing inside the head — whether that report exists is
  // the route's question, not the head's.
  it('titles a report this instance does not have', async () => {
    const title = await titleFor('nothing__here');

    expect(title).toBe('nothing__here');
  });

  /**
   * A segment is not a report id until `ReportIdSchema` says so — the same guard
   * proxy.ts and the API run. Normally the proxy has already rewritten such a
   * segment to `/_not-found`; these are what the head says on the fail-open path,
   * where a deployment without a reports tree lets one through.
   *
   * Each case is refused for a different clause of `/^[A-Za-z0-9][A-Za-z0-9._-]*$/`
   * — the leading character, the character class, and emptiness — so a regex
   * loosened in one place cannot pass here on the strength of the others.
   */
  it.each([
    ['../../../etc/passwd', 'a traversal that survived decoding'],
    ['-leading-dash', 'a first character the class forbids'],
    ['has spaces', 'a character outside the class'],
    ['ok<script>', 'markup, which React escapes but should not remember'],
    ['', 'nothing at all'],
  ])('refuses %s (%s) and says only that it is a miss', async (id) => {
    const title = await titleFor(id);

    expect(title).toBe(NOT_FOUND_TITLE);
  });

  // Stated separately because the `it.each` above cannot: every string contains
  // the empty one, so a `not.toContain` there passes on the empty case for a
  // reason that has nothing to do with the refusal.
  it('does not echo the refused segment into the tab', async () => {
    const title = await titleFor('../../../etc/passwd');

    expect(title).not.toContain('passwd');
  });
});
