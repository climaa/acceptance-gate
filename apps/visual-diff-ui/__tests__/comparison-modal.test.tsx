// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.tsx` include means tsc typechecks this file.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LedgerChange, LedgerReport } from '@gate/visual-diff/ledger';
import { ComparisonModal } from '../components/ComparisonModal';
import { ReportTemplate } from '../components/ReportTemplate';
import {
  COMPARISON_MODES,
  type ComparisonMode,
  comparisonHref,
  comparisonPath,
} from '../lib/comparison';
import { shotUrl } from '../lib/shots';
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
  /** What the spacing did on this variant. Null is the common case and the
   *  default: a report written before the console measured anything, and every
   *  comparison in the committed fixtures. */
  ledger: LedgerReport | null = null,
) {
  const handlers = {
    onMode: vi.fn<(mode: ComparisonMode) => void>(),
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
      ledger={ledger}
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
  const modalOn = (subject: Variant, mode: ComparisonMode) => (
    <ComparisonModal
      reportId={REPORT}
      variant={subject}
      variants={[PROSE, PROSE_DARK]}
      sides={SIDES}
      mode={mode}
      ledger={null}
      onMode={() => {}}
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

  it('stays while the link it is about is still the one on screen', async () => {
    const { rerender } = await copied(PROSE, 'diff');

    rerender(modalOn(PROSE, 'diff'));

    expect(status()).toBe('link copied');
  });
});

describe('what a comparison is read against', () => {
  // A design board answers whether a screenshot is what was drawn; that is the
  // set's shot view's question, never a comparison's.
  it('offers no design board and no way to ask for one', () => {
    renderModal();

    expect(within(modal()).queryByRole('group', { name: 'compare to' })).toBeNull();
    expect(within(modal()).queryByRole('img', { name: /design board/ })).toBeNull();
  });

  it('keeps every mode, read against the before', () => {
    renderModal();

    expect(within(toolbar()).getAllByRole('button')).toHaveLength(
      COMPARISON_MODES.length,
    );
  });

  describe('an added variant', () => {
    const ADDED = variant({
      key: 'atoms__desktop__light__atoms-bucketchip--tones',
      id: 'atoms-bucketchip--tones',
      bucket: 'added',
      overlapDiffPixels: 0,
      diffPixels: 0,
      allowedDiffPixels: 0,
    });

    // It has no before, so the one thing left to read it against is its design,
    // in the after set — where the board opens on the story's tile.
    it('links to its screenshot beside its design, in the after set', () => {
      renderModal('candidate', ADDED);

      const link = within(modal()).getByRole('link', {
        name: 'open it beside its design',
      });

      expect(link.getAttribute('href')).toBe(`/set/${SIDES.b}/shot/${ADDED.key}`);
    });

    it('says why there is nothing to compare', () => {
      renderModal('candidate', ADDED);

      expect(within(modal()).getByText(/no before to compare against/)).toBeTruthy();
    });
  });

  it('links a variant with a before to no design', () => {
    renderModal();

    expect(within(modal()).queryByRole('link', { name: /beside its design/ })).toBeNull();
  });
});

/**
 * The readings panel and the boxes it points at, as one surface: the table is
 * SpacingReadings' own suite, and what is asserted here is where the panel
 * sits and the wiring between a row and the after screenshot.
 */
describe('the spacing readings', () => {
  /** The dialog's real regression, as x-visual-diff-pages draws it: the button's padding
   *  falling off the scale to the browser's own 6px. */
  const reading = (
    property: string,
    rect: readonly number[] | null,
    label = 'button "Keep it open"',
  ): LedgerChange => ({
    label,
    property,
    change: 'changed',
    before: {
      px: 16,
      token: '--space-4',
      origin: 'regular',
      classification: 'token',
    },
    after: {
      px: 6,
      token: '--space-1',
      origin: 'user-agent',
      classification: 'off-scale',
    },
    rect,
  });

  /** Two paddings on one element and one gap on another: three rows, two
   *  boxes. */
  const LEDGER: LedgerReport = {
    key: PROSE.key,
    mode: 'changed',
    origin: 'target',
    changes: [
      reading('padding-right', [1042, 380, 84, 30]),
      reading('padding-left', [1042, 380, 84, 30]),
      reading('row-gap', [40, 120, 300, 24], 'dialog "Unsaved changes"'),
    ],
  };

  const panel = () => modal().querySelector('.vd-readings') as HTMLElement;
  const unfold = () =>
    fireEvent.click(within(modal()).getByRole('button', { name: 'show' }));
  const readings = () => within(modal()).getByRole('table', { name: 'Spacing readings' });
  const rowFor = (property: string) =>
    within(readings()).getByText(property).closest('tr') as HTMLElement;
  const elementIn = (property: string) => within(rowFor(property)).getByRole('button');
  const marks = () => modal().querySelectorAll<HTMLElement>('.vd-compare__mark');
  const emphasized = () => modal().querySelectorAll('.vd-compare__mark--emphasis');
  const shotsShown = () =>
    within(modal())
      .getAllByRole('img')
      .map((shot) => shot.getAttribute('alt'));

  it('sit beneath the shots, folded to one line', () => {
    renderModal('diff', PROSE, LEDGER);

    expect(modal().querySelector('.vd-compare__stage')?.contains(panel())).toBe(false);
    expect(within(modal()).queryByRole('table', { name: 'Spacing readings' })).toBeNull();
    expect(within(modal()).getByText(/^3 readings/)).toBeTruthy();
  });

  it('list what changed between before and after once unfolded', () => {
    renderModal('diff', PROSE, LEDGER);

    unfold();

    expect(within(readings()).getAllByRole('row')).toHaveLength(4);
    expect(within(modal()).getByText('changed between before and after')).toBeTruthy();
  });

  // Folded even with nothing behind it: most comparisons have no ledger, and a
  // sentence saying so on every one would compete with the shots.
  it('fold a comparison with no ledger too, and say so once unfolded', () => {
    renderModal();
    const sentence = () =>
      within(modal()).getByText('No token ledger for this comparison.');
    const shut = sentence().closest('[hidden]') !== null;

    unfold();

    expect(shut).toBe(true);
    expect(sentence().closest('[hidden]')).toBeNull();
  });

  // A walk writes the address and asks the server for nothing, so the report
  // on hand stays the one the address was loaded with. Readings from another
  // variant would be a panel describing one screenshot beside another — and
  // boxes drawn on the wrong image.
  it('say nothing about a variant they were not read for', () => {
    renderModal('diff', PROSE_DARK, LEDGER);

    unfold();

    expect(within(modal()).queryByRole('table', { name: 'Spacing readings' })).toBeNull();
    expect(
      within(modal()).getByText('No token ledger for this comparison.'),
    ).toBeTruthy();
  });

  it('leave the modes toolbar where it was', () => {
    renderModal('diff', PROSE, LEDGER);

    unfold();

    expect(pressedNames()).toEqual(['diff']);
  });

  describe('the boxes on the after screenshot', () => {
    it('draws none until a reading is pointed at', () => {
      renderModal('candidate', PROSE, LEDGER);

      unfold();

      expect(marks()).toHaveLength(0);
    });

    it('outlines one box per element, the pressed one emphasized', () => {
      renderModal('candidate', PROSE, LEDGER);
      unfold();

      fireEvent.click(elementIn('padding-right'));

      // Three rows, two elements: two paddings on one box are two readings
      // and one outline.
      expect(marks()).toHaveLength(2);
      expect(emphasized()).toHaveLength(1);
    });

    // The boxes were measured in the after capture's own pixels, so each is
    // placed as a share of them: it lands on its element at any width.
    it('places a box as a share of the shot’s own pixels', () => {
      renderModal('candidate', PROSE, LEDGER);
      unfold();

      fireEvent.click(elementIn('row-gap'));

      const box = modal().querySelector<HTMLElement>('.vd-compare__mark--emphasis');
      expect(box?.style.left).toBe(`${(40 / 1248) * 100}%`);
      expect(box?.style.top).toBe(`${(120 / 469) * 100}%`);
      expect(box?.style.width).toBe(`${(300 / 1248) * 100}%`);
      expect(box?.style.height).toBe(`${(24 / 469) * 100}%`);
    });

    it('frames the shot at its own size in actual size', () => {
      renderModal('actual size', PROSE, LEDGER);
      unfold();

      fireEvent.click(elementIn('row-gap'));

      expect(modal().querySelector('.vd-compare__marked--actual')).not.toBeNull();
    });

    // The diff is not the after screenshot: a box drawn on it would be
    // outlining pixels nobody measured. Focus is the keyboard's hover.
    it('shows the after screenshot while a row has focus, then hands the stage back', () => {
      renderModal('diff', PROSE, LEDGER);
      unfold();

      fireEvent.focus(elementIn('padding-right'));
      const previewed = shotsShown();
      const boxed = emphasized().length;
      fireEvent.blur(elementIn('padding-right'));

      expect(previewed).toEqual(['candidate']);
      expect(boxed).toBe(1);
      expect(shotsShown()).toEqual(['diff']);
      expect(marks()).toHaveLength(0);
    });

    it('previews under the pointer too, and lets it go', () => {
      renderModal('slider', PROSE, LEDGER);
      unfold();

      fireEvent.mouseEnter(elementIn('row-gap'));
      const previewed = shotsShown();
      fireEvent.mouseLeave(elementIn('row-gap'));

      expect(previewed).toEqual(['candidate']);
      expect(shotsShown()).toEqual(['baseline', 'candidate']);
    });

    // A press outlasts the pointer, and a stage held on the after screenshot
    // would contradict the toolbar's pressed mode.
    it('leaves the mode on show for a press, drawing its box where the after shot is', () => {
      renderModal('diff', PROSE, LEDGER);
      unfold();

      fireEvent.click(elementIn('padding-right'));

      expect(shotsShown()).toEqual(['diff']);
      expect(marks()).toHaveLength(0);
    });

    // A reading on an element that is gone has no rect to point at.
    it('previews nothing for a reading with no box', () => {
      const gone: LedgerReport = {
        ...LEDGER,
        changes: [{ ...reading('padding-right', null), change: 'gone', after: null }],
      };
      renderModal('diff', PROSE, gone);
      unfold();

      fireEvent.focus(elementIn('padding-right'));

      expect(shotsShown()).toEqual(['diff']);
      expect(marks()).toHaveLength(0);
    });

    // A removed variant's after side is a sentence, not an image to draw on.
    it('previews nothing on a variant with no after screenshot', () => {
      const removed = variant({
        key: PROSE.key,
        id: PROSE.id,
        bucket: 'removed',
        width: null,
        height: null,
      });
      renderModal('baseline', removed, LEDGER);
      unfold();

      fireEvent.focus(elementIn('row-gap'));

      expect(shotsShown()).toEqual(['baseline']);
      expect(within(modal()).getByRole('img').getAttribute('src')).toBe(
        shotUrl(REPORT, PROSE.key, 'baseline'),
      );
    });
  });
});

/**
 * The report's half of the seam: which variant the modal is on, and in which
 * mode, is in the URL — so a reviewer can send a colleague the exact thing they
 * are looking at. What has been reviewed stays in `localStorage`, where it
 * belongs to one person; the URL carries position and nothing else.
 */
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
