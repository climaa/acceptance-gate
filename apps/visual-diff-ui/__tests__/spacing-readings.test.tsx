// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.tsx` include means tsc typechecks this file.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChangeSide, LedgerChange, LedgerReport } from '@gate/visual-diff/ledger';
import { SpacingReadings } from '../components/SpacingReadings';

/**
 * The list a designer reads beside the board: what the spacing did, in
 * design-token terms.
 *
 * Structural only, like every component suite here. Whether the warning tone
 * reads as a warning is the baselines' question; what is asserted here is the
 * wording — which is the whole point of the panel. "nearest `--space-1` (+2)"
 * is a sentence about the design system, and a panel that said "6px" instead
 * would be a pixel count the modal already has.
 *
 * The emphasis a pressed row drives on the after screenshot lives next door, in
 * comparison-modal.test.tsx: the marks belong to the pane, not to the table.
 */

const KEY = 'organisms__desktop__light__organisms-dialog--open';

const side = (over: Partial<ChangeSide> = {}): ChangeSide => ({
  px: 6,
  token: '--space-1',
  origin: 'user-agent',
  classification: 'off-scale',
  ...over,
});

/** The dialog's real regression: the button's padding falling off the scale to
 *  the browser's own 6px. */
const change = (over: Partial<LedgerChange> = {}): LedgerChange => ({
  label: 'button "Keep it open"',
  property: 'padding-right',
  change: 'changed',
  before: side({
    px: 16,
    token: '--space-4',
    origin: 'regular',
    classification: 'token',
  }),
  after: side(),
  rect: [280.27, 462.91, 106.19, 30],
  ...over,
});

const report = (over: Partial<LedgerReport> = {}): LedgerReport => ({
  key: KEY,
  mode: 'changed',
  origin: 'target',
  changes: [change()],
  ...over,
});

function renderPanel(ledger: LedgerReport | null, pressed: number | null = null) {
  const handlers = {
    onPress: vi.fn<(index: number | null) => void>(),
    onHover: vi.fn<(index: number | null) => void>(),
  };

  render(<SpacingReadings ledger={ledger} pressed={pressed} {...handlers} />);

  return handlers;
}

const table = () => screen.getByRole('table', { name: 'Spacing readings' });
const bodyRows = () => within(table()).getAllByRole('row').slice(1);
const headers = () =>
  within(table())
    .getAllByRole('columnheader')
    .map((cell) => cell.textContent);

afterEach(cleanup);

describe('the spacing readings panel', () => {
  it('names itself, whatever it found', () => {
    renderPanel(report());

    expect(screen.getByRole('heading', { name: 'Spacing readings' })).toBeTruthy();
  });

  it('lists one row per reported change, in the order the report holds them', () => {
    renderPanel(
      report({
        changes: [change(), change({ property: 'padding-left' })],
      }),
    );

    expect(
      bodyRows().map((row) => within(row).getByText(/padding-/).textContent),
    ).toEqual(['padding-right', 'padding-left']);
  });

  it('reads the element, both sides and the token term off one row', () => {
    renderPanel(report());

    const cells = within(bodyRows()[0] as HTMLElement).getAllByRole('cell');
    expect(cells.map((cell) => cell.textContent)).toEqual([
      'button "Keep it open"',
      'padding-right',
      '--space-4 (16px)',
      '6pxbrowser default',
      'off-scalenearest --space-1 (+2)',
    ]);
  });

  // The whole reason the panel exists rather than a pixel count: the value is
  // named against the scale, and the signed difference says how far off it is.
  it.each([
    { px: 16.5, token: '--space-4', expected: 'nearest --space-4 (+0.5)' },
    // A tie goes to the lower step — the classifier's `nearestTie`, read back
    // here as the distance to the step it actually named.
    { px: 18, token: '--space-4', expected: 'nearest --space-4 (+2)' },
    { px: 80, token: '--space-16', expected: 'nearest --space-16 (+16)' },
    // The scale has no `--space-7`, so 28 is named against the step it has.
    { px: 28, token: '--space-6', expected: 'nearest --space-6 (+4)' },
  ])('names $px against $token with the difference', ({ px, token, expected }) => {
    renderPanel(report({ changes: [change({ after: side({ px, token }) })] }));

    expect(within(table()).getByText(expected)).toBeTruthy();
  });

  it('writes a value under its nearest step as a minus, not as a negative plus', () => {
    renderPanel(report({ changes: [change({ after: side({ px: 1 }) })] }));

    expect(within(table()).getByText('nearest --space-1 (−3)')).toBeTruthy();
  });

  // `raw-on-scale` is the one classification where "should be" is honest: the
  // value IS the step, written as a literal instead of through the token.
  it('says a literal that equals a step should be the step', () => {
    renderPanel(
      report({
        changes: [
          change({
            after: side({ px: 16, token: '--space-4', classification: 'raw-on-scale' }),
          }),
        ],
      }),
    );

    expect(within(table()).getByText('should be --space-4')).toBeTruthy();
  });

  it('names an element that arrived or left rather than a token it has none of', () => {
    renderPanel(
      report({
        changes: [change({ change: 'gone', after: null, rect: null })],
      }),
    );

    const cells = within(bodyRows()[0] as HTMLElement).getAllByRole('cell');
    expect(cells.map((cell) => cell.textContent)).toEqual([
      'button "Keep it open"',
      'padding-right',
      '--space-4 (16px)',
      '—',
      'gone',
    ]);
  });

  it('names an element that arrived, with no before side to read it against', () => {
    renderPanel(
      report({
        changes: [change({ change: 'appeared', before: null })],
      }),
    );

    const cells = within(bodyRows()[0] as HTMLElement).getAllByRole('cell');
    expect(cells.map((cell) => cell.textContent)).toEqual([
      'button "Keep it open"',
      'padding-right',
      '—',
      '6pxbrowser default',
      'appeared',
    ]);
  });

  // Both sides off the scale is the common shape of a value that merely moved:
  // there is no token to name the before side in, so it is the pixels it was.
  it('writes a before side that no design token set as the pixels it measured', () => {
    renderPanel(report({ changes: [change({ before: side({ px: 3 }) })] }));

    const before = within(bodyRows()[0] as HTMLElement).getAllByRole('cell')[2];
    expect(before?.textContent).toBe('3px');
  });

  it('says only off-scale where the capture had no step to name', () => {
    renderPanel(report({ changes: [change({ after: side({ token: null }) })] }));

    const token = within(bodyRows()[0] as HTMLElement)
      .getAllByRole('cell')
      .at(-1);
    expect(token?.textContent).toBe('off-scale');
  });

  // A name outside the spacing scale is worth half a sentence rather than a
  // difference against a step this panel would have had to invent.
  it('names a nearest step it cannot price without pricing it', () => {
    renderPanel(report({ changes: [change({ after: side({ token: '--gutter' }) })] }));

    expect(within(table()).getByText('nearest --gutter')).toBeTruthy();
  });

  it('says a value is exempt without claiming it should be anything', () => {
    renderPanel(
      report({
        changes: [
          change({ after: side({ px: 2, token: null, classification: 'exempt' }) }),
        ],
      }),
    );

    const token = within(bodyRows()[0] as HTMLElement)
      .getAllByRole('cell')
      .at(-1);
    expect(token?.textContent).toBe('exempt');
  });

  describe('the mode it is reading in', () => {
    it('says what it compared when both sides measured', () => {
      renderPanel(report());

      expect(screen.getByText('changed between before and after')).toBeTruthy();
      expect(headers()).toEqual(['element', 'property', 'before', 'after', 'token']);
    });

    // Every compare against `baselines`: the corpus is committed rather than
    // captured, so there is no before side and no before column to draw.
    it('drops the before column where there was no before side to read', () => {
      renderPanel(
        report({
          mode: 'after-only',
          changes: [change({ change: 'present', before: null })],
        }),
      );

      expect(screen.getByText('after side · off-scale only')).toBeTruthy();
      expect(headers()).toEqual(['element', 'property', 'after', 'token']);
    });
  });

  describe('the row a reader is pointing at', () => {
    const element = () => within(table()).getByRole('button', { name: /Keep it open/ });

    it('presses no row to begin with', () => {
      renderPanel(report());

      expect(element().getAttribute('aria-pressed')).toBe('false');
    });

    it('asks for the pressed row when one is pressed', () => {
      const handlers = renderPanel(report());

      fireEvent.click(element());

      expect(handlers.onPress).toHaveBeenCalledWith(0);
    });

    it('presses the row it is told to, and gives it up on a second press', () => {
      const handlers = renderPanel(report(), 0);

      fireEvent.click(element());

      expect(element().getAttribute('aria-pressed')).toBe('true');
      expect(handlers.onPress).toHaveBeenCalledWith(null);
    });

    it('previews a row while a pointer is over it, and stops when it leaves', () => {
      const handlers = renderPanel(report());

      fireEvent.mouseEnter(element());
      fireEvent.mouseLeave(element());

      expect(handlers.onHover.mock.calls).toEqual([[0], [null]]);
    });
  });

  describe('with nothing to list', () => {
    it('says the spacing held between the two captures', () => {
      renderPanel(report({ changes: [] }));

      expect(
        screen.getByText('No spacing changed between before and after.'),
      ).toBeTruthy();
      expect(screen.queryByRole('table')).toBeNull();
    });

    it('says the after screenshot is all on the scale', () => {
      renderPanel(report({ mode: 'after-only', changes: [] }));

      expect(
        screen.getByText('No off-scale spacing in the after screenshot.'),
      ).toBeTruthy();
    });

    // No file at all — a report from before the console measured anything — and
    // a report whose after capture measured nothing read the same: there is no
    // ledger to name a mode, so the panel names neither.
    it.each([
      { what: 'no report', ledger: null },
      { what: 'a report with no mode', ledger: report({ mode: null, changes: [] }) },
    ])('says there is no ledger for $what', ({ ledger }) => {
      renderPanel(ledger);

      expect(screen.getByText('No token ledger for this comparison.')).toBeTruthy();
      expect(screen.queryByText(/between before and after/)).toBeNull();
    });
  });
});
