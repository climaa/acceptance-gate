import type { Locator, Page } from '@playwright/test';

/**
 * A release tag, safe to drop inside a regular expression.
 *
 * Tags carry dots — `v0.3.0` — and an unescaped dot is "any character". No two
 * releases differ only at those positions today, so this fixes no live bug; it
 * removes a locator that would quietly match the wrong control the day one
 * does.
 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * `/changelog` — the releases, and the control that opens their conversations.
 *
 * The comment control is located by its ACCESSIBLE NAME, never by a class or a
 * data attribute, and that is not a stylistic preference here. The page carries
 * every release at once and renders exactly one control, so "which release is
 * this press about" is a question only the name answers — it is the single
 * thing on the page that says both which version the control is aimed at and
 * what a press will do to it. A locator that reached for the element any other
 * way would find the button in every state and tell the scenario nothing.
 *
 * Nothing here asserts. The claims belong to the steps.
 */
export class ChangelogPage {
  /** Every release entry, in the order the page renders them. */
  readonly releases: Locator;

  constructor(private readonly page: Page) {
    // The entries are the only `<article>`s on the page.
    this.releases = page.locator('article[id]');
  }

  async open() {
    await this.page.goto('/changelog');
  }

  /**
   * The tags on the page, newest first.
   *
   * Read off the rendered entries rather than written into a step, for the
   * reason `blog-index.ts` never hardcodes a slug: the release list is content,
   * and a scenario that names a version goes red the week that version stops
   * being the newest.
   */
  async releaseTags(): Promise<string[]> {
    await this.releases.first().waitFor({ state: 'visible' });
    const ids = await this.releases.evaluateAll((articles) =>
      articles.map((article) => article.id),
    );
    return ids;
  }

  /**
   * The comment control, whatever state it is in.
   *
   * Matched on the name's stable half — the release it is about — so one
   * locator follows the control through load, wait, arrive and retry. Which of
   * those it is currently in is what `name()` answers, and that is a step's
   * question, not this one's.
   */
  syncButtonFor(tag: string): Locator {
    return this.page.getByRole('button', {
      name: new RegExp(`\\b${escapeRegExp(tag)}\\b`),
    });
  }

  /** What the control currently calls itself — the whole accessible name. */
  async syncButtonName(tag: string): Promise<string> {
    const name = await this.syncButtonFor(tag).getAttribute('aria-label');
    return name ?? '';
  }

  /**
   * Where one release's conversation lands. Empty until a reader asks for it.
   *
   * Interpolated, and that is fine here in a way it is not in the regular
   * expression above: a quoted attribute selector matches its value literally,
   * so a dot is a dot. There is no wildcard to escape.
   */
  commentsFor(tag: string): Locator {
    return this.page.locator(`[data-release-comments="${tag}"]`);
  }

  /** The embed itself, once a press has mounted one. */
  threadFrameFor(tag: string): Locator {
    return this.commentsFor(tag).locator('iframe');
  }

  /**
   * The control's written note — the failure in words, beside the colour.
   *
   * By role, not by class: the element carries `role="status"` precisely so the
   * failure is announced, and the role is the contract. `post.ts` and
   * `blog-index.ts` reach for tags and attributes only where no role exists;
   * here one does.
   */
  get note(): Locator {
    return this.page.getByRole('status');
  }

  /**
   * Brings one release to the TOP of the viewport.
   *
   * Top, not merely on screen, and the distinction is the whole scenario. The
   * control is about the first release in document order that is visible, so a
   * minimal scroll — which is all `scrollIntoViewIfNeeded` promises — can leave
   * the previous release still showing above and still winning. Aligning to the
   * top scrolls the earlier ones off, which is what a reader arriving at a
   * release actually sees.
   */
  async scrollToTop(tag: string) {
    await this.page
      .locator(`article[id="${tag}"]`)
      .evaluate((article) => article.scrollIntoView({ block: 'start' }));
  }
}
