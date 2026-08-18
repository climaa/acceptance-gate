// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.tsx` include means tsc typechecks this file.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReportTemplate } from '../components/ReportTemplate';
import { reviewStorageKey } from '../lib/review-state';
import type { Summary, Variant } from '../lib/summary';
import { replaceCalls, setSearchParams } from './stubs/next-navigation';

/**
 * The review loop: where a reviewer stands, what moves them, and where the marks
 * they make go.
 *
 * The marks go into `localStorage` and nowhere else. That is not an
 * implementation note — it is what makes every browser context its own reviewer,
 * what keeps a server from ever holding an opinion about whether a human looked,
 * and what the accept gate counts. So this suite asserts the storage key, and
 * asserts that reviewing issues no request at all.
 *
 * The filters unmount. A card that is still in the DOM behind `display: none` is
 * a card a reviewer can be told they have already seen.
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

const PROSE = variant({
  key: 'atoms__desktop__light__atoms-prose--default',
  id: 'atoms-prose--default',
});

const POST = variant({
  key: 'templates__desktop__light__templates-posttemplate--long-prose',
  id: 'templates-posttemplate--long-prose',
  tier: 'templates',
});

const REPORT: Summary = {
  schemaVersion: 1,
  exitCode: 1,
  thresholds: { maxDiffPixels: 40, maxDiffRatio: 0.0005 },
  env: { platform: 'linux', arch: 'arm64' },
  counts: { unchanged: 100, changed: 2, added: 0, removed: 0, errored: 0, a11y: 0 },
  warnings: [],
  variants: [PROSE, POST],
};

function renderReport(report: Summary = REPORT) {
  setSearchParams('');

  return render(
    <main>
      <ReportTemplate id={REPORT_ID} report={report} sets={[]} />
    </main>,
  );
}

const progress = () => screen.getByTestId('review-progress');
const cards = () => screen.queryAllByRole('article');

function firstCard(): HTMLElement {
  const [card] = cards();
  if (!card) throw new Error('the report under test rendered no cards');

  return card;
}

/** The first card's own checkbox — every card carries one, so the query is
 *  scoped rather than global. */
const markFirstCard = () =>
  fireEvent.click(within(firstCard()).getByRole('checkbox', { name: 'reviewed' }));

afterEach(() => {
  cleanup();
  localStorage.clear();
  replaceCalls.length = 0;
  vi.unstubAllGlobals();
});

describe('the review progress', () => {
  // Pinned format, matched downstream by an anchored regex: no inner spaces, and
  // nothing else inside the element that carries the testid.
  it('reads as reviewed N/M', () => {
    renderReport();

    expect(progress().textContent).toMatch(/^reviewed \d+\/\d+$/);
  });

  it('counts against every variant the report holds', () => {
    renderReport();

    expect(progress().textContent).toBe('reviewed 0/2');
  });

  it('advances by one when a story is marked', () => {
    renderReport();

    markFirstCard();

    expect(progress().textContent).toBe('reviewed 1/2');
  });

  // A live region, so a mark reaches a screen reader — but one region for the
  // whole report rather than one per card, which would be a storm.
  it('announces politely', () => {
    renderReport();

    expect(progress().getAttribute('role')).toBe('status');
  });
});

describe('the review marks', () => {
  it('round-trips through localStorage under the report id', () => {
    renderReport();

    markFirstCard();

    // The atoms tier leads the ladder, so the first card is the prose one.
    expect(localStorage.getItem(reviewStorageKey(REPORT_ID))).toBe(
      JSON.stringify([PROSE.key]),
    );
  });

  it('reads the marks this browser already holds', () => {
    localStorage.setItem(reviewStorageKey(REPORT_ID), JSON.stringify([POST.key]));

    renderReport();

    expect(progress().textContent).toBe('reviewed 1/2');
  });

  // The server never learns which variants a reader has opened, and never should
  // — every e2e context is its own reviewer precisely because of this.
  it('never asks the server anything', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderReport();

    markFirstCard();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('mirrors where the reviewer is into the URL, and never what they judged', () => {
    renderReport();

    fireEvent.change(screen.getByRole('searchbox', { name: 'title or story id' }), {
      target: { value: 'prose' },
    });

    expect(replaceCalls.at(-1)?.url).toBe('/?filter=prose');
  });

  it('starts from the review position the URL was opened at', () => {
    setSearchParams('filter=posttemplate');

    render(
      <main>
        <ReportTemplate id={REPORT_ID} report={REPORT} sets={[]} />
      </main>,
    );

    expect(cards()).toHaveLength(1);
  });
});

describe('the filters', () => {
  it('unmounts the cards a text filter excludes', () => {
    renderReport();

    fireEvent.change(screen.getByRole('searchbox', { name: 'title or story id' }), {
      target: { value: 'PostTemplate' },
    });

    expect(cards()).toHaveLength(1);
  });

  it('matches the story id as well as the title', () => {
    renderReport();

    fireEvent.change(screen.getByRole('searchbox', { name: 'title or story id' }), {
      target: { value: 'atoms-prose' },
    });

    expect(cards()).toHaveLength(1);
  });

  it('unmounts a reviewed card when reviewed cards are hidden', () => {
    renderReport();
    markFirstCard();

    fireEvent.click(screen.getByRole('checkbox', { name: 'hide reviewed' }));

    expect(cards()).toHaveLength(1);
  });
});

describe('the review accelerators', () => {
  it('moves focus to an unreviewed card', () => {
    renderReport();

    fireEvent.click(screen.getByRole('button', { name: 'next unreviewed' }));

    expect(document.activeElement).toBe(cards()[0]);
  });

  it('skips the card that has already been reviewed', () => {
    renderReport();
    markFirstCard();

    fireEvent.click(screen.getByRole('button', { name: 'next unreviewed' }));

    expect(document.activeElement).toBe(cards()[1]);
  });

  it('walks the cards with j and marks the walked one with space', () => {
    renderReport();
    fireEvent.keyDown(document, { key: 'j' });

    fireEvent.keyDown(document, { key: ' ' });

    expect(progress().textContent).toBe('reviewed 1/2');
  });

  it('walks back with k', () => {
    renderReport();
    fireEvent.keyDown(document, { key: 'j' });
    fireEvent.keyDown(document, { key: 'j' });

    fireEvent.keyDown(document, { key: 'k' });

    expect(document.activeElement).toBe(cards()[0]);
  });

  // The keys belong to the report, not to the search box: a reviewer typing
  // `jenkins` into the filter is not walking anything.
  it('leaves the keys alone while the reviewer is typing', () => {
    renderReport();
    const search = screen.getByRole('searchbox', { name: 'title or story id' });
    search.focus();

    fireEvent.keyDown(search, { key: 'j' });

    expect(document.activeElement).toBe(search);
  });

  it('collapses every section at once', () => {
    renderReport();

    fireEvent.click(screen.getByRole('button', { name: 'collapse all' }));

    expect(cards()).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'expand all' })).toBeTruthy();
  });
});
