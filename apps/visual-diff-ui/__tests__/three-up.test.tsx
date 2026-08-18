// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.tsx` include means tsc typechecks this file.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThreeUp } from '../components/ThreeUp';
import type { Variant } from '../lib/summary';

/**
 * The viewer inside a variant row: baseline, candidate and the diff between
 * them, side by side, and the two tools that open the comparison modal.
 *
 * Structural only. What the three frames look like is the baselines' business —
 * this suite asserts that each frame names the side it shows, that a side which
 * does not exist says so rather than rendering an empty box, and that every
 * shot is addressed through the app's own immutable route.
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

const CHANGED = variant({
  key: 'atoms__desktop__light__atoms-prose--default',
  id: 'atoms-prose--default',
});

function renderViewer(subject: Variant = CHANGED, onCompare = vi.fn()) {
  render(
    <ThreeUp reportId={REPORT} variant={subject} sides={SIDES} onCompare={onCompare} />,
  );

  return onCompare;
}

const frame = (name: string) => screen.getByRole('figure', { name });

afterEach(cleanup);

describe('the three-up viewer', () => {
  it('names one frame per side, and the diff between them', () => {
    renderViewer();

    expect(frame(`A · ${SIDES.a}`)).toBeTruthy();
    expect(frame(`B · ${SIDES.b}`)).toBeTruthy();
    expect(frame('diff')).toBeTruthy();
  });

  it('serves every shot from the immutable route the report owns', () => {
    renderViewer();

    for (const shot of screen.getAllByRole('img')) {
      expect(shot.getAttribute('src')).toContain(`/api/shots/${REPORT}/${CHANGED.key}.`);
    }
  });

  it('says the baseline side is absent for a story that was added', () => {
    renderViewer(
      variant({
        key: 'atoms__desktop__light__atoms-bucketchip--tones',
        id: 'atoms-bucketchip--tones',
        bucket: 'added',
        overlapDiffPixels: 0,
        diffPixels: 0,
        allowedDiffPixels: 0,
      }),
    );

    expect(within(frame(`A · ${SIDES.a}`)).getByText('not on this side')).toBeTruthy();
  });

  it('says the candidate side is absent for a story that was removed', () => {
    renderViewer(
      variant({
        key: 'molecules__desktop__light__molecules-taglist--empty',
        id: 'molecules-taglist--empty',
        tier: 'molecules',
        bucket: 'removed',
        overlapDiffPixels: 0,
        diffPixels: 0,
        allowedDiffPixels: 0,
      }),
    );

    expect(within(frame(`B · ${SIDES.b}`)).getByText('not on this side')).toBeTruthy();
  });

  // A diff is painted only for a pair that was compared. One side missing is
  // not "no difference" — it is nothing to difference.
  it('says there was nothing to compare when one side is missing', () => {
    renderViewer(
      variant({
        key: 'molecules__desktop__light__molecules-taglist--empty',
        id: 'molecules-taglist--empty',
        tier: 'molecules',
        bucket: 'removed',
        overlapDiffPixels: 0,
        diffPixels: 0,
        allowedDiffPixels: 0,
      }),
    );

    expect(within(frame('diff')).getByText('nothing to compare')).toBeTruthy();
  });
});

describe('the compare tools', () => {
  it('offers blink and the slider overlay, named exactly', () => {
    renderViewer();

    expect(screen.getByRole('button', { name: 'blink' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'slider overlay' })).toBeTruthy();
  });

  it('opens the comparison in blink mode', () => {
    const onCompare = renderViewer();

    fireEvent.click(screen.getByRole('button', { name: 'blink' }));

    expect(onCompare).toHaveBeenCalledWith(CHANGED, 'blink');
  });

  it('opens the comparison in slider mode', () => {
    const onCompare = renderViewer();

    fireEvent.click(screen.getByRole('button', { name: 'slider overlay' }));

    expect(onCompare).toHaveBeenCalledWith(CHANGED, 'slider');
  });

  // Clicking a shot is the third way in, and it opens on the shot that was
  // clicked: a reviewer who pressed the diff wants the diff.
  it('opens the comparison on the shot that was clicked', () => {
    const onCompare = renderViewer();

    fireEvent.click(within(frame('diff')).getByRole('button'));

    expect(onCompare).toHaveBeenCalledWith(CHANGED, 'diff');
  });

  it('leaves an absent side unclickable — there is nothing to open', () => {
    renderViewer(
      variant({
        key: 'atoms__desktop__light__atoms-bucketchip--tones',
        id: 'atoms-bucketchip--tones',
        bucket: 'added',
        overlapDiffPixels: 0,
        diffPixels: 0,
        allowedDiffPixels: 0,
      }),
    );

    expect(within(frame(`A · ${SIDES.a}`)).queryByRole('button')).toBeNull();
  });
});
