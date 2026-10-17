import type { Locator, Page } from '@playwright/test';

import { endsWithWord } from './comparison-modal';

/**
 * The shot view: one screenshot of a set beside a design board — a dialog over
 * the set when a screenshot is pressed there, the page itself when its address
 * is loaded cold. Both carry one accessible name, so `root` is either.
 */
export class ShotView {
  readonly modal: Locator;
  readonly expanded: Locator;
  readonly root: Locator;
  readonly boardPane: Locator;
  readonly screenshotPane: Locator;
  readonly readings: Locator;
  readonly unfold: Locator;

  constructor(private readonly page: Page) {
    this.modal = page.getByRole('dialog', { name: 'Screenshot' });
    // The expanded presentation is a named section, which is a region.
    this.expanded = page.getByRole('region', { name: 'Screenshot' });
    this.root = this.modal.or(this.expanded);
    this.boardPane = this.root.getByRole('group', { name: 'design board', exact: true });
    this.screenshotPane = this.root.getByRole('group', {
      name: 'screenshot',
      exact: true,
    });
    this.readings = this.root.getByRole('table', { name: 'Spacing readings' });
    this.unfold = this.root.getByRole('button', { name: 'show', exact: true });
  }

  /** A screenshot's link in the set viewer, named `<story> · <viewport>/<theme>`. */
  setLink(story: string, viewport: string, theme: string): Locator {
    return this.page.getByRole('link', {
      name: `${story} · ${viewport}/${theme}`,
      exact: true,
    });
  }

  /** The way back to the set, which the expanded page has in place of a close. */
  backTo(label: string): Locator {
    return this.page.getByRole('link', { name: `← set ${label}`, exact: true });
  }

  /** Text the readings panel shows outside its table: a caption, an empty state. */
  readingsText(text: string): Locator {
    return this.root.getByText(text, { exact: true });
  }

  /** One reading by its property. Its cells run element, property, value, design
   *  token; as cards, below 768px, each cell's name leads with its header, so the
   *  property is matched at the name's end, as the comparison's readings are. */
  reading(property: string): Locator {
    return this.readings
      .getByRole('row')
      .filter({ has: this.page.getByRole('cell', { name: endsWithWord(property) }) });
  }
}
