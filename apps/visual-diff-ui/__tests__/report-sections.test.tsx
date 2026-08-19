// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.tsx` include means tsc typechecks this file.
import { afterEach, describe, expect, it } from 'vitest';
import { ReportTemplate } from '../components/ReportTemplate';
import type { CaptureSet, Summary, Variant } from '../lib/summary';
import { setSearchParams } from './stubs/next-navigation';

/**
 * How the report is organised — which is the whole of its argument.
 *
 * Accessibility leads: the first region a reviewer meets answers *is anything
 * inaccessible?* before *did anything move?*, and an `a11y` variant is never
 * folded into the tier section its pixels would put it in. The rest is the
 * design system's own ladder, one named region per tier.
 *
 * Rendered through `ReportTemplate` rather than the route, because the route
 * only resolves the data directory (data.test.ts owns that) and hands the
 * summary over.
 */

const REPORT_ID = 'main-2026-08-17__main-2026-08-13';

function variant(overrides: Partial<Variant> & Pick<Variant, 'key' | 'id'>): Variant {
  return {
    tier: 'atoms',
    viewport: 'desktop',
    theme: 'light',
    bucket: 'changed',
    overlapDiffPixels: 4213,
    marginPixels: 0,
    diffPixels: 4213,
    allowedDiffPixels: 292,
    width: 1248,
    height: 469,
    sizeDelta: null,
    violations: [],
    error: null,
    ...overrides,
  };
}

const A11Y = variant({
  key: 'organisms__desktop__light__atoms-badge--tones',
  id: 'atoms-badge--tones',
  tier: 'organisms',
  bucket: 'a11y',
  overlapDiffPixels: 0,
  violations: [{ id: 'color-contrast', nodes: 2 }],
});

/** The same story, in a bucket the accessibility section must not surrender it to. */
const A11Y_PIXELS = variant({
  key: 'organisms__desktop__dark__atoms-badge--tones',
  id: 'atoms-badge--tones',
  tier: 'organisms',
  theme: 'dark',
});

const CHANGED = variant({
  key: 'templates__desktop__light__templates-posttemplate--long-prose',
  id: 'templates-posttemplate--long-prose',
  tier: 'templates',
});

const REMOVED = variant({
  key: 'molecules__desktop__light__molecules-taglist--empty',
  id: 'molecules-taglist--empty',
  tier: 'molecules',
  bucket: 'removed',
  overlapDiffPixels: 0,
});

const WARNING =
  '14 unstable story(ies) matched byte-for-byte across sets — treated as unchanged.';

const SETS: CaptureSet[] = [
  {
    label: 'main-2026-08-17',
    sha: 'f2570e1',
    branch: 'main',
    capturedAt: '2026-08-17',
    stories: 106,
  },
  {
    label: 'main-2026-08-13',
    sha: 'e0427b4',
    branch: 'main',
    capturedAt: '2026-08-13',
    stories: 104,
  },
];

const REPORT: Summary = {
  schemaVersion: 1,
  exitCode: 1,
  thresholds: { maxDiffPixels: 40, maxDiffRatio: 0.0005 },
  env: { platform: 'linux', arch: 'arm64' },
  counts: { unchanged: 100, changed: 2, added: 0, removed: 1, errored: 0, a11y: 1 },
  warnings: [WARNING],
  variants: [A11Y, A11Y_PIXELS, CHANGED, REMOVED],
};

/** The template inside the landmark the app shell gives it, so the ordering
 *  assertions below are about `main`'s regions and not about the whole page. */
function renderReport(report: Summary = REPORT, id = REPORT_ID) {
  setSearchParams('');

  return render(
    <main>
      <ReportTemplate id={id} report={report} sets={SETS} />
    </main>,
  );
}

const main = () => screen.getByRole('main');
/**
 * The tier sections, which are every region inside `main` except the report's
 * own header.
 *
 * The header is a labelled `region` rather than a second `banner` — see
 * ReportTemplate.tsx for why — so a bare region sweep of `main` now collects it
 * alongside the sections. Filtering it out by name keeps these cases saying what
 * they mean: one region per tier, in tier order. Folding `'report'` into each
 * expected list would have passed just as well and asserted something else.
 */
const tierRegions = () =>
  within(main())
    .getAllByRole('region')
    .filter((region) => region.getAttribute('aria-label') !== 'report');
const buckets = () => screen.getByRole('group', { name: 'Buckets' });

const namesOf = (elements: readonly HTMLElement[]) =>
  elements.map((element) => element.getAttribute('aria-label'));

// `globals` is off in vitest.config.ts, so Testing Library registers no automatic
// cleanup — without this every render stacks in the same document.
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('the result sections', () => {
  it('leads with the accessibility region', () => {
    renderReport();

    const regions = tierRegions();

    expect(namesOf(regions)[0]).toBe('Accessibility');
  });

  it('names one region per tier that has variants', () => {
    renderReport();

    const regions = tierRegions();

    expect(namesOf(regions)).toEqual([
      'Accessibility',
      'molecules',
      'organisms',
      'templates',
    ]);
  });

  it('keeps an a11y variant out of the tier section its pixels would put it in', () => {
    renderReport();

    const a11y = within(main()).getByRole('region', { name: 'Accessibility' });
    const organisms = within(main()).getByRole('region', { name: 'organisms' });

    expect(within(a11y).getAllByRole('article')).toHaveLength(1);
    expect(within(organisms).getAllByRole('article')).toHaveLength(1);
  });

  it('counts a section against its own variants', () => {
    renderReport();

    const organisms = within(main()).getByRole('region', { name: 'organisms' });

    expect(within(organisms).getByRole('heading', { level: 2 }).textContent).toContain(
      '(1) 0/1',
    );
  });

  it('collapses a section out of the DOM rather than hiding it', () => {
    renderReport();
    const organisms = within(main()).getByRole('region', { name: 'organisms' });

    fireEvent.click(
      within(organisms).getByRole('button', { name: 'collapse organisms' }),
    );

    expect(within(organisms).queryAllByRole('article')).toHaveLength(0);
  });
});

describe('the bucket chip row', () => {
  it('leads with a11y when the bucket is not empty', () => {
    renderReport();

    const chips = within(buckets()).getAllByRole('button');

    expect(namesOf(chips)[0]).toBe('a11y');
  });

  it('leaves a11y in its own place when nothing is inaccessible', () => {
    renderReport({
      ...REPORT,
      counts: { ...REPORT.counts, a11y: 0 },
      variants: [CHANGED],
    });

    const chips = within(buckets()).getAllByRole('button');

    expect(namesOf(chips)[0]).toBe('changed');
  });

  // `changed` is a substring of `unchanged`, and the two are the verdicts this
  // whole gate exists to keep apart. Their names are exact, never derived from
  // the chips' contents.
  it('names changed and unchanged as two different chips', () => {
    renderReport();

    const changed = within(buckets()).getByRole('button', { name: 'changed' });
    const unchanged = within(buckets()).getByRole('button', { name: 'unchanged' });

    expect(changed).not.toBe(unchanged);
  });

  it('filters the sections down to the bucket that was picked', () => {
    renderReport();

    fireEvent.click(within(buckets()).getByRole('button', { name: 'removed' }));

    expect(namesOf(tierRegions())).toEqual(['molecules']);
  });

  // A clean run writes no variants at all — every one of them matched. The
  // report still opens, and says so rather than reading as an empty filter.
  it('says nothing moved when the run produced no variants', () => {
    renderReport({
      ...REPORT,
      exitCode: 0,
      counts: { unchanged: 106, changed: 0, added: 0, removed: 0, errored: 0, a11y: 0 },
      variants: [],
    });

    expect(screen.getByText(/every variant matched its baseline/)).toBeTruthy();
  });

  it('says why the unchanged bucket has nothing to open', () => {
    renderReport();

    fireEvent.click(within(buckets()).getByRole('button', { name: 'unchanged' }));

    expect(screen.getByText(/counted, never written/)).toBeTruthy();
  });
});

describe('the report header', () => {
  it('identifies both capture sets', () => {
    renderReport();

    const header = screen.getByRole('region', { name: 'report' });

    expect(header.textContent).toContain('main-2026-08-17');
    expect(header.textContent).toContain('f2570e1');
    expect(header.textContent).toContain('main-2026-08-13');
    expect(header.textContent).toContain('e0427b4');
  });

  // The provenance folds so a reviewer can have the screenful back for image
  // comparisons — but it folds inside the landmark, so what the report says it
  // compared is the same either way.
  it('folds its provenance behind one disclosure, open by default', () => {
    renderReport();

    const header = screen.getByRole('region', { name: 'report' });
    const details = within(header).getByText('report details').closest('details');

    expect(details?.hasAttribute('open')).toBe(true);
    expect(details?.textContent).toContain('main-2026-08-17');
    expect(details?.textContent).toContain('thresholds');
  });

  it('carries the report id as the page heading', () => {
    renderReport();

    const heading = screen.getByRole('heading', { level: 1 });

    expect(heading.textContent).toBe(REPORT_ID);
  });

  // A report outlives the sets it was built from — a pruned label is still half
  // the comparison, and a header that dropped it would be hiding one side.
  it('keeps a side whose label the registry no longer holds', () => {
    renderReport(REPORT, 'main-2026-08-17__pruned-2026-08-01');

    const header = screen.getByRole('region', { name: 'report' });

    expect(header.textContent).toContain('pruned-2026-08-01');
    expect(within(header).getByText(/no capture set recorded/)).toBeTruthy();
  });
});

describe('the corpus warnings', () => {
  it('names the unstable stories, undismissably', () => {
    renderReport();

    const note = screen.getByRole('note', { name: 'corpus warnings' });

    expect(note.textContent).toContain(WARNING);
    expect(within(note).queryByRole('button')).toBeNull();
  });

  it('renders nothing at all for a run that recorded none', () => {
    renderReport({ ...REPORT, warnings: [] });

    expect(screen.queryByRole('note', { name: 'corpus warnings' })).toBeNull();
  });
});
