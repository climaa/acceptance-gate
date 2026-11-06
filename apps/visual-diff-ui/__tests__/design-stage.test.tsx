// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.tsx` include means tsc typechecks this file.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LedgerChange, LedgerReport } from '@gate/visual-diff/ledger';
import { type DesignShot, DesignStage, type Split } from '../components/DesignStage';
import { DESIGN_BOARDS, type DesignBoard } from '../lib/comparison';
import { designBoardUrl } from '../lib/design-urls';
import { pairedReadings } from '../lib/readings';

/**
 * The stage a set's shot view is: a design board in one pane, a screenshot in
 * the other, and the spacing readings under both. Rendered on its own, so
 * what is asserted is the stage's wiring — which board is on show, what a pick
 * asks for, and how a reading lights its box on the screenshot — whatever
 * hosts it.
 */

const KEY = 'atoms__desktop__light__atoms-prose--default';

const SHOT: DesignShot = {
  key: KEY,
  src: `/api/sets/main-2026-08-13/shots/${KEY}.png`,
  absent: 'not on this side',
  caption: 'main-2026-08-13 · 1248×469',
  alt: 'candidate',
  label: 'after screenshot',
};

/** The dialog's real regression, as x-visual-diff-pages draws it: the button's
 *  padding falling off the scale to the browser's own 6px. */
const reading = (
  property: string,
  rect: readonly number[] | null,
  label = 'button "Keep it open"',
): LedgerChange => ({
  label,
  property,
  change: 'changed',
  before: { px: 16, token: '--space-4', origin: 'regular', classification: 'token' },
  after: { px: 6, token: '--space-1', origin: 'user-agent', classification: 'off-scale' },
  rect,
});

/** Two paddings on one element and one gap on another: three rows, two boxes. */
const LEDGER: LedgerReport = {
  key: KEY,
  mode: 'changed',
  origin: 'target',
  changes: [
    reading('padding-right', [1042, 380, 84, 30]),
    reading('padding-left', [1042, 380, 84, 30]),
    reading('row-gap', [40, 120, 300, 24], 'dialog "Unsaved changes"'),
  ],
};

interface StageInput {
  board?: DesignBoard;
  split?: Split;
  grid?: boolean;
  shot?: DesignShot;
  ledger?: LedgerReport | null;
}

function renderStage({
  board = '01-atoms',
  split = 'columns',
  grid = false,
  shot = SHOT,
  ledger = null,
}: StageInput = {}) {
  const onBoard = vi.fn<(board: DesignBoard) => void>();

  const view = render(
    <DesignStage
      split={split}
      grid={grid}
      board={board}
      onBoard={onBoard}
      shot={shot}
      ledger={ledger && pairedReadings(ledger)}
    />,
  );

  return { onBoard, container: view.container };
}

const pressedIn = (group: HTMLElement) =>
  within(group)
    .getAllByRole('button')
    .filter((button) => button.getAttribute('aria-pressed') === 'true')
    .map((button) => button.textContent);

const picker = () => screen.getByRole('group', { name: 'board' });

/**
 * jsdom lays nothing out and loads no image, so a pane has no size and an image
 * no natural size — and a `PanZoom` with no scale draws neither a grid nor a
 * mark. Registered by the blocks that need one: every pane measures 400×300
 * from the prototype (it measures itself once, on mount), and `loadBothPanes`
 * is what gives each image its own pixels.
 */
function measuredPanes() {
  const sizes = ['clientWidth', 'clientHeight'] as const;
  const saved = sizes.map((key) =>
    Object.getOwnPropertyDescriptor(HTMLElement.prototype, key),
  );

  beforeEach(() => {
    sizes.forEach((key, index) =>
      Object.defineProperty(HTMLElement.prototype, key, {
        configurable: true,
        get(this: HTMLElement) {
          return this.classList.contains('ds-panzoom__pane') ? [400, 300][index] : 0;
        },
      }),
    );
  });
  afterEach(() => {
    sizes.forEach((key, index) => {
      const descriptor = saved[index];
      if (descriptor) Object.defineProperty(HTMLElement.prototype, key, descriptor);
    });
  });
}

function loadBothPanes() {
  for (const img of document.querySelectorAll<HTMLImageElement>('.ds-panzoom__image')) {
    Object.defineProperty(img, 'naturalWidth', { value: 1600 });
    Object.defineProperty(img, 'naturalHeight', { value: 2400 });
    fireEvent.load(img);
  }
}

afterEach(cleanup);

describe('the board pane', () => {
  it('shows the board on show in a pane the reader can move around in', () => {
    renderStage({ board: 'x-visual-diff-pages' });

    const board = screen.getByRole('img', { name: 'the console design board' });

    expect(board.getAttribute('src')).toBe(designBoardUrl('x-visual-diff-pages'));
    expect(screen.getByRole('group', { name: 'design board' })).toBeTruthy();
  });

  it('presses the board on show, among every board', () => {
    renderStage({ board: '05-pages' });

    expect(within(picker()).getAllByRole('button')).toHaveLength(DESIGN_BOARDS.length);
    expect(pressedIn(picker())).toEqual(['pages']);
  });

  it('asks for another board when one is picked', () => {
    const { onBoard } = renderStage();

    fireEvent.click(within(picker()).getByRole('button', { name: 'flows' }));

    expect(onBoard).toHaveBeenCalledWith('06-flows-decisions');
  });

  it('asks for nothing when the board on show is picked again', () => {
    const { onBoard } = renderStage();

    fireEvent.click(within(picker()).getByRole('button', { name: 'atoms' }));

    expect(onBoard).not.toHaveBeenCalled();
  });
});

describe('the screenshot pane', () => {
  // Read the same way as the board: fitted at 100%, dragged and zoomed.
  it('puts the screenshot beside the board, in a pane with its own zoom', () => {
    renderStage();

    const pane = screen.getByRole('group', { name: 'after screenshot' });

    expect(within(pane).getByRole('img', { name: 'candidate' })).toBeTruthy();
    expect(screen.getByText(SHOT.caption)).toBeTruthy();
    expect(screen.getByRole('group', { name: 'after screenshot zoom' })).toBeTruthy();
  });

  it('says why there is no screenshot, rather than framing nothing', () => {
    renderStage({ shot: { ...SHOT, src: undefined } });

    expect(screen.queryByRole('img', { name: 'candidate' })).toBeNull();
    expect(screen.getByText('not on this side')).toBeTruthy();
  });
});

describe('the split and the grid', () => {
  const design = (container: HTMLElement) =>
    container.querySelector('.vd-compare__design');

  it.each(['columns', 'rows'] as const)('lays the panes out as %s', (split) => {
    const { container } = renderStage({ split });

    expect(design(container)?.getAttribute('data-split')).toBe(split);
  });

  describe('drawn', () => {
    measuredPanes();

    it('lays a grid over both panes when on', () => {
      renderStage({ grid: true });

      loadBothPanes();

      expect(document.querySelectorAll('.ds-panzoom__grid')).toHaveLength(2);
    });

    it('lays none when off', () => {
      renderStage();

      loadBothPanes();

      expect(document.querySelectorAll('.ds-panzoom__grid')).toHaveLength(0);
    });
  });
});

describe('the spacing readings', () => {
  const readings = () => screen.getByRole('table', { name: 'Spacing readings' });
  const rowFor = (property: string) =>
    within(readings()).getByText(property).closest('tr') as HTMLElement;
  const elementIn = (property: string) => within(rowFor(property)).getByRole('button');
  const marks = () => document.querySelectorAll('.ds-panzoom__mark');
  const emphasized = () => document.querySelectorAll('.ds-panzoom__mark--emphasis');
  const boxToggle = () => screen.getByRole('button', { name: 'show spacing boxes' });

  it('lists the readings in a row of its own below both panes', () => {
    const { container } = renderStage({ ledger: LEDGER });

    expect(within(readings()).getAllByRole('row')).toHaveLength(4);
    const panel = container.querySelector('.vd-readings');
    expect(container.querySelector('.vd-compare__stage--design')?.contains(panel)).toBe(
      false,
    );
  });

  // Readings from another screenshot would be a panel describing one image
  // beside another — and boxes drawn on the wrong one.
  it('says nothing about a screenshot its readings were not read for', () => {
    renderStage({
      ledger: { ...LEDGER, key: 'atoms__desktop__dark__atoms-prose--default' },
    });

    expect(screen.queryByRole('table', { name: 'Spacing readings' })).toBeNull();
    expect(screen.getByText('No token ledger for this comparison.')).toBeTruthy();
  });

  describe('the boxes on the screenshot', () => {
    measuredPanes();

    it('outlines one box per element the readings name', () => {
      renderStage({ ledger: LEDGER });

      loadBothPanes();

      // Three rows, two elements: two paddings on one box are two readings
      // and one outline.
      expect(marks()).toHaveLength(2);
      expect(emphasized()).toHaveLength(0);
    });

    it('emphasizes the box of the row a reader presses', () => {
      renderStage({ ledger: LEDGER });
      loadBothPanes();

      fireEvent.click(elementIn('padding-right'));

      expect(elementIn('padding-right').getAttribute('aria-pressed')).toBe('true');
      expect(emphasized()).toHaveLength(1);
    });

    it('previews a box while the pointer is over its row, and lets it go', () => {
      renderStage({ ledger: LEDGER });
      loadBothPanes();

      fireEvent.mouseEnter(elementIn('row-gap'));
      const previewed = emphasized().length;
      fireEvent.mouseLeave(elementIn('row-gap'));

      expect(previewed).toBe(1);
      expect(emphasized()).toHaveLength(0);
    });

    it('keeps the pressed box once focus leaves another row', () => {
      renderStage({ ledger: LEDGER });
      loadBothPanes();
      fireEvent.click(elementIn('padding-right'));

      fireEvent.focus(elementIn('row-gap'));
      fireEvent.blur(elementIn('row-gap'));

      expect(elementIn('padding-right').getAttribute('aria-pressed')).toBe('true');
      expect(emphasized()).toHaveLength(1);
    });

    it('draws the boxes from the start, and puts its toggle on the screenshot pane', () => {
      renderStage({ ledger: LEDGER });
      loadBothPanes();

      const bar = screen.getByRole('group', { name: 'after screenshot zoom' });

      expect(within(bar).getByRole('button', { name: 'show spacing boxes' })).toBe(
        boxToggle(),
      );
      expect(boxToggle().getAttribute('aria-pressed')).toBe('true');
    });

    it('takes the boxes off the screenshot when the toggle is released', () => {
      renderStage({ ledger: LEDGER });
      loadBothPanes();

      fireEvent.click(boxToggle());
      const hidden = marks().length;
      fireEvent.click(boxToggle());

      expect(hidden).toBe(0);
      expect(marks()).toHaveLength(2);
    });

    // A reading on an element that is gone has no rect to point at, so there
    // is nothing for a toggle to show or hide.
    it('offers no toggle where no reading has a box', () => {
      const gone: LedgerReport = {
        ...LEDGER,
        changes: [{ ...reading('padding-right', null), change: 'gone', after: null }],
      };
      renderStage({ ledger: gone });

      loadBothPanes();

      expect(screen.queryByRole('button', { name: 'show spacing boxes' })).toBeNull();
      expect(marks()).toHaveLength(0);
    });
  });
});

describe('an image from your own computer', () => {
  const created: string[] = [];
  const revoked: string[] = [];

  beforeEach(() => {
    created.length = 0;
    revoked.length = 0;
    URL.createObjectURL = vi.fn(() => {
      const url = `blob:local/${created.length + 1}`;
      created.push(url);
      return url;
    });
    URL.revokeObjectURL = vi.fn((url: string) => {
      revoked.push(url);
    });
  });

  const fileInput = () =>
    document.querySelector<HTMLInputElement>('input[type="file"]') as HTMLInputElement;
  const pick = (file: File) =>
    fireEvent.change(fileInput(), { target: { files: [file] } });
  const png = (name = 'my-design.png') => new File(['x'], name, { type: 'image/png' });

  it('offers a button for it on the board pane, named for what it does', () => {
    renderStage();

    const button = within(
      screen.getByRole('group', { name: 'design board zoom' }),
    ).getByRole('button', { name: 'compare against an image from your computer' });

    expect(button).toBeTruthy();
  });

  it('accepts images only', () => {
    renderStage();

    expect(fileInput().getAttribute('accept')).toBe('image/*');
  });

  // Never uploaded, never in the link: shown from an object URL in place.
  it('shows the picked image in place of the board, by its name', () => {
    renderStage();

    pick(png());

    const image = screen.getByRole('img', { name: 'your design, my-design.png' });
    expect(image.getAttribute('src')).toBe('blob:local/1');
    // Shown, not only hovered: a keyboard or touch reader sees which file it is.
    const named = screen.getByText('my-design.png');
    expect(named.closest('[title]')?.getAttribute('title')).toBe('my-design.png');
  });

  it('presses no board while your image is the one on show', () => {
    renderStage();

    pick(png());

    expect(pressedIn(picker())).toHaveLength(0);
  });

  it('goes back to the boards when one is picked, and lets the file go', () => {
    renderStage();
    pick(png());

    fireEvent.click(within(picker()).getByRole('button', { name: 'atoms' }));

    expect(screen.getByRole('img', { name: 'the atoms design board' })).toBeTruthy();
    expect(revoked).toEqual(['blob:local/1']);
  });

  it('ignores a file that is not an image, rather than showing a broken one', () => {
    renderStage();

    pick(new File(['x'], 'notes.txt', { type: 'text/plain' }));

    expect(created).toEqual([]);
    expect(screen.getByRole('img', { name: 'the atoms design board' })).toBeTruthy();
  });
});
