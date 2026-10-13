// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.tsx` include means tsc typechecks this file.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ComparisonModal } from '../components/ComparisonModal';
import { ReportTemplate } from '../components/ReportTemplate';
import {
  type Against,
  COMPARISON_MODES,
  type ComparisonMode,
  comparisonHref,
  comparisonPath,
  type DesignBoard,
  designBoardUrl,
} from '../lib/comparison';
import type { CaptureSet, Summary, Variant } from '../lib/summary';
import { storyTitle } from '../lib/title';
import { pushCalls, setPathname, setSearchParams } from './stubs/next-navigation';

/**
 * The surface a reviewer actually decides on: one variant, six ways of looking
 * at it, and the two dismissals every dialog in this system has.
 *
 * Structural only. Whether blink alternates convincingly and whether the
 * divider lands on the pixel the pointer did are questions for the baselines
 * and for the browser — what is asserted here is the wiring an end-to-end
 * scenario has to find: the dialog's name, the toolbar's exact button names,
 * the pressed state, and the scrubber that is the divider's accessible twin.
 */

const REPORT = 'main-2026-08-17__main-2026-08-13';
const SIDES = { a: 'main-2026-08-17', b: 'main-2026-08-13' };

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

const PROSE_DARK = variant({
  key: 'atoms__desktop__dark__atoms-prose--default',
  id: 'atoms-prose--default',
  theme: 'dark',
});

/**
 * The one viewport question this component asks, answered before it mounts.
 * jsdom has no `matchMedia` at all, so every test states the width it is about
 * rather than inheriting a default from the environment.
 */
function setViewport(wide: boolean): void {
  window.matchMedia = ((query: string) => ({
    matches: query.includes('min-width') ? wide : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

function renderModal(
  mode: ComparisonMode = 'diff',
  subject: Variant = PROSE,
  against: Against = 'before',
  board: DesignBoard = 'component-library',
) {
  const handlers = {
    onMode: vi.fn<(mode: ComparisonMode) => void>(),
    onAgainst: vi.fn<(against: Against) => void>(),
    onBoard: vi.fn<(board: DesignBoard) => void>(),
    onClose: vi.fn<() => void>(),
    onVariant: vi.fn<(variant: Variant) => void>(),
  };

  render(
    <ComparisonModal
      reportId={REPORT}
      variant={subject}
      variants={[PROSE, PROSE_DARK]}
      sides={SIDES}
      mode={mode}
      against={against}
      board={board}
      {...handlers}
    />,
  );

  return handlers;
}

const modal = () => screen.getByRole('dialog', { name: 'Comparison' });
const toolbar = () => within(modal()).getByRole('toolbar');
const scrubber = () => within(modal()).getByRole('slider', { name: 'slider position' });
const divider = () => modal().querySelector('[data-testid="slider-divider"]');

const pressedNames = () =>
  within(toolbar())
    .getAllByRole('button')
    .filter((button) => button.getAttribute('aria-pressed') === 'true')
    .map((button) => button.textContent);

beforeEach(() => setViewport(true));
afterEach(cleanup);

describe('the comparison modal', () => {
  it('is a dialog named Comparison', () => {
    renderModal();

    expect(modal()).toBeTruthy();
  });

  it('names the story and the variant it is showing', () => {
    renderModal();

    expect(within(modal()).getByText(/Prose — Default/)).toBeTruthy();
    expect(within(modal()).getByText(/desktop\/light/)).toBeTruthy();
  });

  it('reports how much of the shared area moved', () => {
    renderModal();

    expect(within(modal()).getByText(/4,213 px/)).toBeTruthy();
  });

  it('serves its shots from the report route, never inline', () => {
    renderModal('slider');

    for (const shot of within(modal()).getAllByRole('img')) {
      expect(shot.getAttribute('src')).toContain(`/api/shots/${REPORT}/`);
    }
  });
});

describe('the mode toolbar', () => {
  it('offers every mode, named exactly', () => {
    renderModal();

    for (const mode of COMPARISON_MODES) {
      expect(within(toolbar()).getByRole('button', { name: mode })).toBeTruthy();
    }
  });

  it('presses the active mode and nothing else', () => {
    renderModal('slider');

    expect(pressedNames()).toEqual(['slider']);
  });

  it('asks for the mode that was picked', () => {
    const { onMode } = renderModal('diff');

    fireEvent.click(within(toolbar()).getByRole('button', { name: 'blink' }));

    expect(onMode).toHaveBeenCalledWith('blink');
  });

  it('shows only the candidate in candidate mode', () => {
    renderModal('candidate');

    const shots = within(modal()).getAllByRole('img');

    expect(shots.map((shot) => shot.getAttribute('alt'))).toEqual(['candidate']);
  });

  // Wiring only: that blink is showing one of the pair, not how fast it swaps.
  it('shows one of the pair in blink mode', () => {
    renderModal('blink');

    const shots = within(modal()).getAllByRole('img');

    expect(shots).toHaveLength(1);
    expect(['baseline', 'candidate']).toContain(shots[0]?.getAttribute('alt'));
  });

  it('says so rather than framing an empty box when the shot does not exist', () => {
    renderModal(
      'baseline',
      variant({
        key: 'atoms__desktop__light__atoms-bucketchip--tones',
        id: 'atoms-bucketchip--tones',
        bucket: 'added',
        overlapDiffPixels: 0,
        diffPixels: 0,
        allowedDiffPixels: 0,
      }),
    );

    expect(within(modal()).getByText('not on this side')).toBeTruthy();
    expect(within(modal()).queryAllByRole('img')).toHaveLength(0);
  });

  // The row that opens this modal stopped quoting a pixel count for a variant
  // with one side; the modal has to stop too, or the sentence the row refused
  // to tell is one click away. `compare.mjs` spreads zeros over a row it never
  // measured, and `0 px differ in the shared area` reads them as a clean shared
  // area rather than as the absence of one.
  it('quotes no pixel count for a variant that had nothing to compare', () => {
    renderModal(
      'baseline',
      variant({
        key: 'atoms__desktop__light__atoms-bucketchip--tones',
        id: 'atoms-bucketchip--tones',
        bucket: 'added',
        overlapDiffPixels: 0,
        diffPixels: 0,
        allowedDiffPixels: 0,
      }),
    );

    expect(within(modal()).queryByText(/differ in the shared area/)).toBeNull();
  });
});

describe('the slider', () => {
  it('splits the shots down the middle to begin with', () => {
    renderModal('slider');

    expect(scrubber().getAttribute('aria-valuenow')).toBe('50');
    expect(divider()?.getAttribute('style')).toContain('50%');
  });

  it('moves the divider with the scrubber', () => {
    renderModal('slider');

    fireEvent.keyDown(scrubber(), { key: 'ArrowRight' });

    expect(scrubber().getAttribute('aria-valuenow')).not.toBe('50');
    expect(divider()?.getAttribute('style')).not.toContain('50%');
  });

  // The two answers a reviewer reaches for once they have found the difference:
  // all of one shot, or all of the other — and neither runs past its end.
  it('shows all of the baseline at one end', () => {
    renderModal('slider');

    fireEvent.keyDown(scrubber(), { key: 'End' });

    expect(scrubber().getAttribute('aria-valuenow')).toBe('100');
  });

  it('shows all of the candidate at the other, and stops there', () => {
    renderModal('slider');

    fireEvent.keyDown(scrubber(), { key: 'Home' });
    fireEvent.keyDown(scrubber(), { key: 'ArrowLeft' });

    expect(scrubber().getAttribute('aria-valuenow')).toBe('0');
  });

  it('draws no divider in a mode that shows one shot', () => {
    renderModal('candidate');

    expect(divider()).toBeNull();
    expect(within(modal()).queryByRole('slider')).toBeNull();
  });
});

describe('the modal keyboard', () => {
  it('closes on escape', () => {
    const { onClose } = renderModal();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalled();
  });

  it('walks to the next variant', () => {
    const { onVariant } = renderModal('diff', PROSE);

    fireEvent.keyDown(document, { key: 'ArrowRight' });

    expect(onVariant).toHaveBeenCalledWith(PROSE_DARK);
  });

  it('walks back to the previous variant', () => {
    const { onVariant } = renderModal('diff', PROSE_DARK);

    fireEvent.keyDown(document, { key: 'ArrowLeft' });

    expect(onVariant).toHaveBeenCalledWith(PROSE);
  });

  it('stays on the last variant rather than wrapping', () => {
    const { onVariant } = renderModal('diff', PROSE_DARK);

    fireEvent.keyDown(document, { key: 'ArrowRight' });

    expect(onVariant).not.toHaveBeenCalled();
  });

  // The scrubber owns the arrow keys while it has focus, or a reviewer nudging
  // the divider would be thrown onto another variant instead.
  it('leaves the arrow keys to the scrubber', () => {
    const { onVariant } = renderModal('slider');

    fireEvent.keyDown(scrubber(), { key: 'ArrowRight' });

    expect(onVariant).not.toHaveBeenCalled();
  });
});

describe('below the mobile breakpoint', () => {
  beforeEach(() => setViewport(false));

  it('keeps the dialog and its name — the sheet is presentation', () => {
    renderModal();

    expect(modal()).toBeTruthy();
  });

  it('drops actual size, which the platform already does by pinching', () => {
    renderModal();

    expect(within(toolbar()).queryByRole('button', { name: 'actual size' })).toBeNull();
  });

  it('keeps the other five modes as pressable buttons', () => {
    renderModal('blink');

    const names = within(toolbar())
      .getAllByRole('button')
      .map((button) => button.textContent);

    expect(names).toEqual(['baseline', 'candidate', 'diff', 'blink', 'slider']);
    expect(pressedNames()).toEqual(['blink']);
  });

  it('keeps the close button, which is the accessible way out', () => {
    renderModal();

    expect(within(modal()).getByRole('button', { name: 'close' })).toBeTruthy();
  });

  // A link written on a desktop opens on a phone, where that mode has no
  // control: the stage and the toolbar have to agree about what is on screen.
  it('falls back to the default mode for one this width does not offer', () => {
    renderModal('actual size');

    expect(pressedNames()).toEqual(['diff']);
  });
});

describe('the copy-link status', () => {
  const modalOn = (
    subject: Variant,
    mode: ComparisonMode,
    against: Against = 'before',
  ) => (
    <ComparisonModal
      reportId={REPORT}
      variant={subject}
      variants={[PROSE, PROSE_DARK]}
      sides={SIDES}
      mode={mode}
      against={against}
      board="component-library"
      onMode={() => {}}
      onAgainst={() => {}}
      onBoard={() => {}}
      onClose={() => {}}
      onVariant={() => {}}
    />
  );

  async function copied(subject: Variant, mode: ComparisonMode) {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: async () => {} },
      configurable: true,
    });
    const view = render(modalOn(subject, mode));
    await act(async () => {
      fireEvent.click(within(modal()).getByRole('button', { name: 'copy link' }));
    });

    return view;
  }

  const status = () => within(modal()).getByRole('status').textContent;

  it('clears once the arrows walk to another variant', async () => {
    const { rerender } = await copied(PROSE, 'diff');

    rerender(modalOn(PROSE_DARK, 'diff'));

    expect(status()).toBe('');
  });

  it('clears once the mode changes', async () => {
    const { rerender } = await copied(PROSE, 'diff');

    rerender(modalOn(PROSE, 'blink'));

    expect(status()).toBe('');
  });

  // A remount would put focus on the body, outside the dialog's trap.
  it('keeps the focus of a reviewer who copied, then walked', async () => {
    const { rerender } = await copied(PROSE, 'diff');
    const button = within(modal()).getByRole('button', { name: 'copy link' });
    button.focus();

    rerender(modalOn(PROSE_DARK, 'diff'));

    expect(document.activeElement).toBe(button);
  });

  it('clears once the comparison is read against a design board instead', async () => {
    const { rerender } = await copied(PROSE, 'diff');

    rerender(modalOn(PROSE, 'diff', 'design'));

    expect(status()).toBe('');
  });

  it('stays while the link it is about is still the one on screen', async () => {
    const { rerender } = await copied(PROSE, 'diff');

    rerender(modalOn(PROSE, 'diff'));

    expect(status()).toBe('link copied');
  });
});

/**
 * The report's half of the seam: which variant the modal is on, and in which
 * mode, is in the URL — so a reviewer can send a colleague the exact thing they
 * are looking at. What has been reviewed stays in `localStorage`, where it
 * belongs to one person; the URL carries position and nothing else.
 */
describe('the design view', () => {
  const REMOVED = variant({
    key: 'atoms__desktop__light__atoms-gone--default',
    id: 'atoms-gone--default',
    bucket: 'removed',
  });

  const against = () => within(modal()).getByRole('group', { name: 'compare to' });
  const pressedIn = (group: HTMLElement) =>
    within(group)
      .getAllByRole('button')
      .filter((button) => button.getAttribute('aria-pressed') === 'true')
      .map((button) => button.textContent);

  it('offers before and design, with before pressed by default', () => {
    renderModal();

    expect(pressedIn(against())).toEqual(['before']);
  });

  it('asks for the design view when design is pressed', () => {
    const handlers = renderModal();

    fireEvent.click(within(against()).getByRole('button', { name: 'design' }));

    expect(handlers.onAgainst).toHaveBeenCalledWith('design');
  });

  // Every mode compares after with before; none can be run against a board.
  it('unmounts the six modes, the metric and the scrubber', () => {
    renderModal('slider', PROSE, 'design');

    expect(within(modal()).queryByRole('toolbar')).toBeNull();
    expect(within(modal()).queryByRole('slider')).toBeNull();
    expect(within(modal()).queryByText(/px differ/)).toBeNull();
  });

  it('says the board is reference, never a verdict', () => {
    renderModal('diff', PROSE, 'design');

    expect(within(modal()).getByText(/never a verdict/)).toBeTruthy();
  });

  it('shows the picked board in a pane the reader can move around in', () => {
    renderModal('diff', PROSE, 'design', 'visual-diff-pages');

    const board = within(modal()).getByRole('img', { name: 'the console design board' });

    expect(board.getAttribute('src')).toBe(designBoardUrl('visual-diff-pages'));
    expect(within(modal()).getByRole('group', { name: 'design board' })).toBeTruthy();
  });

  it('presses the board on show, among all four', () => {
    renderModal('diff', PROSE, 'design', 'pages');

    const picker = within(modal()).getByRole('group', { name: 'board' });

    expect(within(picker).getAllByRole('button')).toHaveLength(4);
    expect(pressedIn(picker)).toEqual(['pages']);
  });

  it('asks for another board when one is picked', () => {
    const handlers = renderModal('diff', PROSE, 'design');

    const picker = within(modal()).getByRole('group', { name: 'board' });
    fireEvent.click(within(picker).getByRole('button', { name: 'flows' }));

    expect(handlers.onBoard).toHaveBeenCalledWith('flows-decisions');
  });

  it('puts the after screenshot beside the board', () => {
    renderModal('diff', PROSE, 'design');

    expect(within(modal()).getByRole('img', { name: 'candidate' })).toBeTruthy();
    expect(within(modal()).getByText(`after · ${SIDES.b}`)).toBeTruthy();
  });

  // Read the same way as the board: fitted at 100%, dragged and zoomed.
  it('gives the after screenshot a pane of its own, with its own zoom', () => {
    renderModal('diff', PROSE, 'design');

    const pane = within(modal()).getByRole('group', { name: 'after screenshot' });

    expect(within(pane).getByRole('img', { name: 'candidate' })).toBeTruthy();
    expect(
      within(modal()).getByRole('group', { name: 'after screenshot zoom' }),
    ).toBeTruthy();
  });

  describe('the split toggle', () => {
    const design = () => modal().querySelector('.vd-compare__design');
    const stack = () =>
      within(modal()).getByRole('button', {
        name: 'stack the board over the screenshot',
      });

    it('opens side by side, offering to stack the panes', () => {
      renderModal('diff', PROSE, 'design');

      expect(design()?.getAttribute('data-split')).toBe('columns');
      expect(stack()).toBeTruthy();
    });

    it('stacks the board over the screenshot when pressed, and offers the way back', () => {
      renderModal('diff', PROSE, 'design');

      fireEvent.click(stack());

      expect(design()?.getAttribute('data-split')).toBe('rows');
      expect(
        within(modal()).getByRole('button', {
          name: 'put the board beside the screenshot',
        }),
      ).toBeTruthy();
    });

    // Below the breakpoint the sheet stacks the panes anyway: a toggle there
    // would be a control that changes nothing.
    it('is not offered on a narrow screen, where the panes are always stacked', () => {
      setViewport(false);
      renderModal('diff', PROSE, 'design');

      expect(
        within(modal()).queryByRole('button', { name: /stack the board/ }),
      ).toBeNull();
      expect(design()?.getAttribute('data-split')).toBe('rows');
    });

    it('is not offered when reading against before', () => {
      renderModal('diff', PROSE, 'before');

      expect(
        within(modal()).queryByRole('button', { name: /stack the board/ }),
      ).toBeNull();
    });
  });

  describe('the grid toggle', () => {
    const gridButton = () => within(modal()).getByRole('button', { name: 'grid' });
    const grids = () => modal().querySelectorAll('.ds-panzoom__grid');

    it('is offered in the design view, off to begin with', () => {
      renderModal('diff', PROSE, 'design');

      expect(gridButton().getAttribute('aria-pressed')).toBe('false');
    });

    /** jsdom lays nothing out and loads no image. Every pane measures 400×300
     *  from the prototype — it measures itself once, on mount — and each image
     *  reports a natural size, so each PanZoom has a scale to draw a grid at. */
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

    function loadBothPanes() {
      for (const img of modal().querySelectorAll<HTMLImageElement>(
        '.ds-panzoom__image',
      )) {
        Object.defineProperty(img, 'naturalWidth', { value: 1600 });
        Object.defineProperty(img, 'naturalHeight', { value: 2400 });
        fireEvent.load(img);
      }
    }

    it('draws a grid over both panes when pressed, and none on a second press', () => {
      renderModal('diff', PROSE, 'design');
      loadBothPanes();

      fireEvent.click(gridButton());
      const drawn = grids().length;
      fireEvent.click(gridButton());

      expect(drawn).toBe(2);
      expect(gridButton().getAttribute('aria-pressed')).toBe('false');
      expect(grids()).toHaveLength(0);
    });

    it('is offered on a narrow screen too, where a grid is still a ruler', () => {
      setViewport(false);
      renderModal('diff', PROSE, 'design');

      expect(gridButton()).toBeTruthy();
    });

    it('is not offered when reading against before', () => {
      renderModal('diff', PROSE, 'before');

      expect(within(modal()).queryByRole('button', { name: 'grid' })).toBeNull();
    });
  });

  // The after side's absence reads the same here as in the modes.
  it('says a removed variant has no after side, rather than framing nothing', () => {
    renderModal('diff', REMOVED, 'design');

    expect(within(modal()).queryByRole('img', { name: 'candidate' })).toBeNull();
    expect(within(modal()).getByText('not on this side')).toBeTruthy();
  });

  it('names the design view keys in the hint line', () => {
    renderModal('diff', PROSE, 'design');

    expect(within(modal()).getByText(/drag the board/)).toBeTruthy();
  });
});

describe('the report opening the modal', () => {
  const CARD_VARIANT = variant({
    key: 'templates__desktop__light__templates-posttemplate--long-prose',
    id: 'templates-posttemplate--long-prose',
    tier: 'templates',
  });

  const SETS: CaptureSet[] = [
    {
      label: SIDES.a,
      sha: 'f2570e1',
      branch: 'main',
      capturedAt: '2026-08-17',
      stories: 106,
    },
    {
      label: SIDES.b,
      sha: 'e0427b4',
      branch: 'main',
      capturedAt: '2026-08-13',
      stories: 104,
    },
  ];

  const A11Y_VARIANT = variant({
    key: 'atoms__desktop__light__atoms-badge--tones',
    id: 'atoms-badge--tones',
    bucket: 'a11y',
    overlapDiffPixels: 0,
    diffPixels: 0,
    violations: [{ id: 'color-contrast', nodes: 2 }],
  });

  const REPORT_SUMMARY: Summary = {
    schemaVersion: 1,
    exitCode: 1,
    thresholds: { maxDiffPixels: 40, maxDiffRatio: 0.0005 },
    env: { platform: 'linux', arch: 'arm64' },
    counts: { unchanged: 100, changed: 2, added: 0, removed: 0, errored: 0, a11y: 1 },
    warnings: [],
    variants: [CARD_VARIANT, PROSE, A11Y_VARIANT],
  };

  function renderReport(query = ''): void {
    setSearchParams(query);
    pushCalls.length = 0;

    render(
      <main>
        <ReportTemplate id={REPORT} report={REPORT_SUMMARY} sets={SETS} />
      </main>,
    );
  }

  const cardOf = (subject: Variant) =>
    screen.getByRole('article', { name: storyTitle(subject.id) });

  afterEach(() => {
    localStorage.clear();
    setPathname('/');
  });

  // The report draws no dialog of its own any more: a comparison is a route,
  // and its modal is the layout's slot — see comparison-route.test.tsx.
  it('draws no dialog, whatever the query string says', () => {
    renderReport(`story=${PROSE.key}&mode=slider`);

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('pushes the comparison a compare tool opened, with its mode', () => {
    renderReport();

    fireEvent.click(
      within(cardOf(PROSE)).getByRole('button', { name: 'slider overlay' }),
    );

    expect(pushCalls).toEqual([comparisonHref(REPORT, PROSE.key, 'slider')]);
  });

  it('pushes blink for the focused card on b', () => {
    renderReport();
    cardOf(PROSE).focus();

    fireEvent.keyDown(document, { key: 'b' });

    expect(pushCalls).toEqual([comparisonHref(REPORT, PROSE.key, 'blink')]);
  });

  // An accessibility failure is not in the pixels. A modal framing two
  // byte-identical shots would invite exactly the review that cannot clear it.
  it('opens nothing on an accessibility card', () => {
    renderReport();
    cardOf(A11Y_VARIANT).focus();

    fireEvent.keyDown(document, { key: 'b' });

    expect(pushCalls).toEqual([]);
  });

  // The walk keys belong to the report behind the modal. Left bound, `b` would
  // push a second comparison over the one the reviewer is reading.
  it('leaves the report keys alone while a comparison is open over it', () => {
    setPathname(comparisonPath(REPORT, PROSE.key));
    renderReport();
    cardOf(PROSE).focus();

    fireEvent.keyDown(document, { key: 'b' });

    expect(pushCalls).toEqual([]);
  });
});
