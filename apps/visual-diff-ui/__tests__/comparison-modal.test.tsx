// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.tsx` include means tsc typechecks this file.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ComparisonModal } from '../components/ComparisonModal';
import { ReportTemplate } from '../components/ReportTemplate';
import { COMPARISON_MODES, type ComparisonMode } from '../lib/comparison';
import type { CaptureSet, Summary, Variant } from '../lib/summary';
import { storyTitle } from '../lib/title';
import { replaceCalls, setSearchParams } from './stubs/next-navigation';

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

function renderModal(mode: ComparisonMode = 'diff', subject: Variant = PROSE) {
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
    replaceCalls.length = 0;

    render(
      <main>
        <ReportTemplate id={REPORT} report={REPORT_SUMMARY} sets={SETS} />
      </main>,
    );
  }

  const lastUrl = () => replaceCalls.at(-1)?.url ?? '';
  const cardOf = (subject: Variant) =>
    screen.getByRole('article', { name: storyTitle(subject.id) });

  afterEach(() => localStorage.clear());

  it('opens on the variant and mode a shared link names', () => {
    renderReport(`story=${PROSE.key}&mode=slider`);

    expect(modal()).toBeTruthy();
    expect(pressedNames()).toEqual(['slider']);
  });

  it('stays shut for a link naming a variant this report does not hold', () => {
    renderReport('story=atoms__desktop__light__atoms-gone--default&mode=slider');

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('writes the variant and the mode a compare tool opened', () => {
    renderReport();

    fireEvent.click(
      within(cardOf(PROSE)).getByRole('button', { name: 'slider overlay' }),
    );

    expect(lastUrl()).toContain(`story=${encodeURIComponent(PROSE.key)}`);
    expect(lastUrl()).toContain('mode=slider');
  });

  it('rewrites the mode when the toolbar switches', () => {
    renderReport(`story=${PROSE.key}&mode=slider`);

    fireEvent.click(within(toolbar()).getByRole('button', { name: 'blink' }));

    expect(lastUrl()).toContain('mode=blink');
  });

  it('clears both params when the modal closes', () => {
    renderReport(`story=${PROSE.key}&mode=slider`);

    fireEvent.click(within(modal()).getByRole('button', { name: 'close' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(lastUrl()).not.toContain('story=');
    expect(lastUrl()).not.toContain('mode=');
  });

  it('opens blink on the focused card with b', () => {
    renderReport();
    cardOf(PROSE).focus();

    fireEvent.keyDown(document, { key: 'b' });

    expect(pressedNames()).toEqual(['blink']);
  });

  // An accessibility failure is not in the pixels. A modal framing two
  // byte-identical shots would invite exactly the review that cannot clear it.
  it('opens nothing on an accessibility card', () => {
    renderReport();
    cardOf(A11Y_VARIANT).focus();

    fireEvent.keyDown(document, { key: 'b' });

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('refuses a link naming an accessibility variant', () => {
    renderReport(`story=${A11Y_VARIANT.key}&mode=diff`);

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  // The walk keys belong to the report behind the modal. Left bound, `j` would
  // move focus out of a trap the reviewer never left.
  it('leaves the report walk alone while the modal is open', () => {
    renderReport(`story=${PROSE.key}&mode=diff`);

    fireEvent.keyDown(document, { key: 'j' });

    expect(modal().contains(document.activeElement)).toBe(true);
  });
});
