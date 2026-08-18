import type { Locator, Page } from '@playwright/test';

/**
 * The comparison surface: one variant's shots, in whichever of the six ways of
 * looking at them the reviewer picked.
 *
 * Below the mobile breakpoint the same dialog presents as a bottom sheet — same
 * role, same name, same close button — so every locator here holds on both form
 * factors and the mode scenarios run untagged.
 */
export class ComparisonModal {
  readonly root: Locator;
  readonly toolbar: Locator;
  readonly shot: Locator;
  readonly divider: Locator;
  readonly scrubber: Locator;

  constructor(page: Page) {
    this.root = page.getByRole('dialog', { name: 'Comparison' });
    this.toolbar = this.root.getByRole('toolbar');
    this.shot = this.root.getByRole('img', { name: /baseline|candidate|diff/ });
    // The divider is a draggable visual with no interactive role of its own —
    // the scrubber below is the accessible control that mirrors it.
    this.divider = this.root.getByTestId('slider-divider');
    this.scrubber = this.root.getByRole('slider', { name: 'slider position' });
  }

  mode(
    name: 'baseline' | 'candidate' | 'diff' | 'blink' | 'slider' | 'actual size',
  ): Locator {
    return this.toolbar.getByRole('button', { name, exact: true });
  }

  async close() {
    await this.root.getByRole('button', { name: 'close' }).click();
  }
}
