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
  readonly readings: Locator;
  readonly spacingBoxes: Locator;
  readonly emphasizedBox: Locator;

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
    this.zoomReadout = this.root
      .getByRole('group', { name: 'design board zoom', exact: true })
      .getByText(/^\d+%$/);
    this.copyStatus = this.root.getByRole('status');
    // The spacing readings table, by the name `Table` gives it from the panel's
    // heading. Below 768px it reflows to cards and keeps its row and cell roles.
    this.readings = this.root.getByRole('table', { name: 'Spacing readings' });
    // The boxes are decoration — an `aria-hidden` layer over the after
    // screenshot, whose meaning the readings table carries in words — so a
    // class is the only handle they offer.
    this.spacingBoxes = this.root.locator('.ds-panzoom__mark');
    this.emphasizedBox = this.root.locator('.ds-panzoom__mark--emphasis');
  }

  /** Text the readings panel shows outside its table: the mode caption, or one
   *  of its three empty states. `EmptyState` carries no role of its own. */
  readingsText(text: string): Locator {
    return this.root.getByText(text, { exact: true });
  }

  /** One reading: the row whose element is `label` and whose property is
   *  `property`. Its cells run element, property, before, after, design token.
   *  As cards, below 768px, each cell's name leads with its column header
   *  ("property padding-right"), so the property is matched at the name's end. */
  reading(label: string, property: string): Locator {
    const page = this.root.page();
    return this.readings
      .getByRole('row')
      .filter({ has: page.getByRole('button', { name: label, exact: true }) })
      .filter({ has: page.getByRole('cell', { name: endsWithWord(property) }) });
  }

  /** One of the three shots by its own name — `alt` is the shot's kind. */
  shotNamed(kind: 'baseline' | 'candidate' | 'diff'): Locator {
    return this.root.getByRole('img', { name: kind, exact: true });
  }

  /** A design board by its picker name, as the pane's image names it. */
  board(
    name:
      | 'atoms'
      | 'molecules'
      | 'organisms'
      | 'templates'
      | 'screens 1'
      | 'screens 2'
      | 'screens 3'
      | 'screens 4'
      | 'pages'
      | 'console'
      | 'flows',
  ): Locator {
    return this.root.getByRole('img', { name: `the ${name} design board` });
  }

  /** The board's zoom controls — scoped, because the after screenshot has a
   *  pane of its own with the same three buttons. */
  zoom(name: 'zoom in' | 'zoom out' | 'reset'): Locator {
    return this.root
      .getByRole('group', { name: 'design board zoom', exact: true })
      .getByRole('button', { name, exact: true });
  }

  mode(
    name: 'baseline' | 'candidate' | 'diff' | 'blink' | 'slider' | 'actual size',
  ): Locator {
    return this.toolbar.getByRole('button', { name, exact: true });
  }
}

/** `text` as the last word of a name, whatever header text precedes it. */
export function endsWithWord(text: string): RegExp {
  return new RegExp(`(^|\\s)${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
}
