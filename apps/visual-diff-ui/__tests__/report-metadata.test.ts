// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.ts` include means tsc typechecks this file.
import { describe, expect, it } from 'vitest';
import { generateMetadata } from '../app/report/[id]/page';
import { APP_NAME } from '../lib/site';

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

  // It never reads the disk, so an id that names nothing still titles the tab
  // rather than throwing inside the head — the miss is the route's to answer.
  it('titles a report this instance does not have', async () => {
    const title = await titleFor('nothing__here');

    expect(title).toBe('nothing__here');
  });
});
