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
  readonly copyLink: Locator;
  readonly against: Locator;
  readonly boardPicker: Locator;
  readonly boardPane: Locator;
  readonly zoomReadout: Locator;
  readonly copyStatus: Locator;

  constructor(page: Page) {
    this.root = page.getByRole('dialog', { name: 'Comparison' });
    this.toolbar = this.root.getByRole('toolbar');
    this.shot = this.root.getByRole('img', { name: /baseline|candidate|diff/ });
    // The divider is a draggable visual with no interactive role of its own —
    // the scrubber below is the accessible control that mirrors it.
    this.divider = this.root.getByTestId('slider-divider');
    this.scrubber = this.root.getByRole('slider', { name: 'slider position' });
    this.copyLink = this.root.getByRole('button', { name: 'copy link', exact: true });
    this.against = this.root.getByRole('group', { name: 'compare to' });
    this.boardPicker = this.root.getByRole('group', { name: 'board', exact: true });
    this.boardPane = this.root.getByRole('group', { name: 'design board', exact: true });
    this.zoomReadout = this.root.getByText(/^\d+%$/);
    this.copyStatus = this.root.getByRole('status');
  }

  /** One of the three shots by its own name — `alt` is the shot's kind. */
  shotNamed(kind: 'baseline' | 'candidate' | 'diff'): Locator {
    return this.root.getByRole('img', { name: kind, exact: true });
  }

  /** A design board by its picker name, as the pane's image names it. */
  board(name: 'components' | 'pages' | 'console' | 'flows'): Locator {
    return this.root.getByRole('img', { name: `the ${name} design board` });
  }

  zoom(name: 'zoom in' | 'zoom out' | 'reset'): Locator {
    return this.root.getByRole('button', { name, exact: true });
  }

  mode(
    name: 'baseline' | 'candidate' | 'diff' | 'blink' | 'slider' | 'actual size',
  ): Locator {
    return this.toolbar.getByRole('button', { name, exact: true });
  }
}
