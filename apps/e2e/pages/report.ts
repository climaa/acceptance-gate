import type { Locator, Page } from '@playwright/test';

import { VD_HOSTS, type VdWorld } from './visual-diff-hosts';

/**
 * One comparison report at `/report/<id>`: the buckets, the review loop, and
 * the cards a reviewer decides about.
 *
 * Every locator is one row of the selector contract the app implements across
 * #275/#281/#283 — ARIA first, a `data-testid` only where no role fits. A hook
 * that cannot be found here is a bug report against the app, never a locator
 * worked around in this file.
 */
export class ReportPage {
  readonly header: Locator;
  readonly bucketChips: Locator;
  readonly reviewProgress: Locator;
  readonly nextUnreviewed: Locator;
  readonly hideReviewed: Locator;
  readonly filter: Locator;
  readonly warningStrip: Locator;
  readonly results: Locator;
  readonly resultSections: Locator;
  readonly storyCards: Locator;
  readonly nothingMoved: Locator;
  readonly a11ySection: Locator;
  readonly backToConsole: Locator;

  constructor(private readonly page: Page) {
    // `region`, not `banner`: the shell renders `SiteHeader` as the page's one
    // body-scope `banner`, and the report's own header is a labelled region
    // beneath it. It used to claim `banner` too, which made two of them on this
    // route — the name (#281 pinned it for exactly this query) kept them apart
    // for a reader and for this locator, but never made the duplicate legal.
    // Still named, for the same reason it always was: `region` is a role the
    // page has more than one of.
    this.header = page.getByRole('region', { name: 'report' });
    this.bucketChips = page.getByRole('group', { name: 'Buckets' }).getByRole('button');
    // The progress figure is text ("reviewed 12/65", no inner spaces — pinned
    // format); the bar next to it is decorative, so the text is the assertion
    // surface.
    this.reviewProgress = page.getByTestId('review-progress');
    this.nextUnreviewed = page.getByRole('button', { name: 'next unreviewed' });
    this.hideReviewed = page.getByRole('checkbox', { name: 'hide reviewed' });
    this.filter = page.getByRole('searchbox', { name: 'title or story id' });
    this.warningStrip = page.getByRole('note', { name: 'corpus warnings' });
    this.results = page.getByRole('main');
    // Every result section is a labelled `<section>`, which is where its
    // `region` role comes from. The report's own header is a region inside
    // `main` as well — explicitly, and see ReportTemplate.tsx for why it is that
    // rather than a second `banner` — and it precedes them all in DOM order, so
    // a bare region sweep of `main` leads with the header and "the accessibility
    // section comes first" reds on a landmark that is not a result at all.
    // Narrowing to the element keeps the ordering claim about the sections.
    this.resultSections = this.results.getByRole('region').and(page.locator('section'));
    this.storyCards = this.results
      .getByRole('article')
      .filter({ has: page.getByRole('checkbox') });
    // The verdict a clean run draws INSTEAD of rows: every variant matched its
    // baseline, so the comparison wrote nothing to review. It is an
    // `EmptyState`, which carries no role of its own, so it is pinned by its
    // copy — the same way this lane pins the console's refusal sentences.
    // `ReportResults.tsx` owns the wording (`NOTHING_MOVED`); only its opening
    // is matched here, so a reworded tail does not red the lane.
    this.nothingMoved = this.results.getByText(/^Nothing moved —/);
    this.a11ySection = this.results.getByRole('region', { name: 'Accessibility' });
    // The way back out of a report. Its accessible name is its text — an arrow
    // and the word — because `ReportTemplate` gives it no `aria-label`, so the
    // U+2190 is part of the contract rather than decoration.
    this.backToConsole = page.getByRole('link', { name: '← console' });
  }

  async open(reportId: string, world: VdWorld = 'seeded') {
    await this.page.goto(`${VD_HOSTS[world]}/report/${reportId}`);
  }

  /** The URL carries the review position (guidelines: URL reflects state) —
   *  filter, bucket, hideReviewed, and the open modal's story + mode. */
  async openDeepLink(reportId: string, params: Record<string, string>) {
    const query = new URLSearchParams(params).toString();
    await this.page.goto(`${VD_HOSTS.seeded}/report/${reportId}?${query}`);
  }

  /** One report through the running config's `baseURL` — the local lane's route
   *  to the dev server on 3300, deep link included. Takes the id as given, so an
   *  address the console could never mint reaches the app unmangled and the
   *  404 it answers with is the app's own. */
  async openHere(reportId: string, params: Record<string, string> = {}) {
    const query = new URLSearchParams(params).toString();
    await this.page.goto(`/report/${reportId}${query ? `?${query}` : ''}`);
  }

  bucketChip(bucket: string): Locator {
    // exact: 'changed' must not also match the 'unchanged' chip.
    return this.bucketChips.filter({
      has: this.page.getByText(bucket, { exact: true }),
    });
  }

  /** A capture set's identity line in the report header — scoped so the same
   *  label elsewhere on the page (pickers, modal title) can't double-match.
   *  Exact, because the heading beside these lines is the report id, which is
   *  `<setA>__<setB>` and therefore contains both labels. */
  setIdentity(label: string): Locator {
    return this.header.getByText(label, { exact: true });
  }

  storyCard(title: string): Locator {
    return this.storyCards.filter({ hasText: title });
  }

  uncheckedCards(): Locator {
    return this.storyCards.filter({
      has: this.page.getByRole('checkbox', { checked: false }),
    });
  }

  checkedCards(): Locator {
    return this.storyCards.filter({
      has: this.page.getByRole('checkbox', { checked: true }),
    });
  }

  async markReviewed(title: string) {
    await this.storyCard(title).getByRole('checkbox').first().check();
  }

  /**
   * The whole-section checkbox in one of `resultSections`.
   *
   * `first()` because the section's head precedes its cards in the DOM, and the
   * only other checkboxes inside a section are the cards' own. Taken by locator
   * rather than by tier name so a caller never has to know which tiers exist —
   * which is what lets the local lane review a report it may not name.
   *
   * It marks every variant of the section, not the cards currently on screen:
   * `onToggleSection` is handed `section.variantKeys`, so a filter or a collapse
   * does not narrow what one click means.
   */
  sectionCheckbox(section: Locator): Locator {
    return section.getByRole('checkbox').first();
  }

  violationList(title: string): Locator {
    return this.storyCard(title).getByRole('list', { name: 'violations' });
  }

  diffShot(title: string): Locator {
    return this.storyCard(title).getByRole('img', { name: 'diff' });
  }

  missingSide(title: string): Locator {
    return this.storyCard(title).getByText('not on this side');
  }

  a11yRuleNote(title: string): Locator {
    // Pinned copy: "reviewing does not clear this — fixing does".
    return this.storyCard(title).getByText('reviewing does not clear this', {
      exact: false,
    });
  }

  /** A chip's count, which `BucketChip` attaches as the description rather than
   *  folding into the accessible name — so the name stays the bucket word and
   *  `changed` never matches `unchanged`. The number is therefore read from the
   *  element, not parsed out of the chip's text. */
  bucketCount(bucket: string): Locator {
    return this.bucketChip(bucket).locator('.ds-bucket-chip__count');
  }

  /** What the report says when there is nothing under the bar. `EmptyState`
   *  carries no role of its own, so the pinned copy is the surface — which is
   *  the right one anyway: reading the wrong one of the three answers as "your
   *  filter is too narrow" is how a passing run is mistaken for a broken
   *  screen. */
  get emptyMessage(): Locator {
    return this.results.locator('.ds-empty__message');
  }

  /** Every story card's own reporting chip — one per visible card, naming the
   *  bucket that card is in. */
  get cardBuckets(): Locator {
    return this.storyCards.locator('.ds-bucket-chip__label');
  }

  compareTool(title: string, tool: 'blink' | 'slider overlay'): Locator {
    return this.storyCard(title).getByRole('button', { name: tool, exact: true });
  }
}
