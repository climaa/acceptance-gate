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
  readonly a11ySection: Locator;

  constructor(private readonly page: Page) {
    // Named, not bare: the app shell renders `SiteHeader` as a body-scope
    // `banner` on every route, so this page has two of them and the report's
    // own is the one labelled `report` (#281 pinned that name for exactly this
    // query). An unnamed lookup matches both and resolves to neither.
    this.header = page.getByRole('banner', { name: 'report' });
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
    this.resultSections = this.results.getByRole('region');
    this.storyCards = this.results
      .getByRole('article')
      .filter({ has: page.getByRole('checkbox') });
    this.a11ySection = this.results.getByRole('region', { name: 'Accessibility' });
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

  compareTool(title: string, tool: 'blink' | 'slider overlay'): Locator {
    return this.storyCard(title).getByRole('button', { name: tool, exact: true });
  }
}
