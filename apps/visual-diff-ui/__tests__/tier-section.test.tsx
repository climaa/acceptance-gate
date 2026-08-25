// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.ts` include means tsc typechecks this file.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TierSection } from '../components/TierSection';
import type { ReportCard, ReportSection } from '../lib/report-view';

/**
 * One tier's section: its heading, its progress, and the checkbox that marks the
 * whole thing at once.
 *
 * Reached only through `ReportTemplate`, whose cases are about which sections
 * appear and in what order. The section-level checkbox was rendered by all of
 * them and pressed by none — `onToggleSection` was a prop nothing called, which is
 * what left this file at 75% of its functions with every test green.
 *
 * It is the control with the most reach on the page: one press marks every
 * variant in a tier, and marking is what the report is FOR. A tri-state that
 * reported the wrong state — checked when half the tier is done — would tell a
 * reviewer they had finished work they had not.
 */

afterEach(cleanup);

const card = (key: string): ReportCard => ({
  key,
  storyId: `atoms-${key}--default`,
  title: `Atoms/${key}`,
  tier: 'atoms',
  bucket: 'changed',
  worst: 0,
  variants: [],
  viewportsShown: [],
});

const SECTION: ReportSection = {
  key: 'atoms',
  name: 'atoms',
  cards: [card('a'), card('b')],
  variantKeys: ['v1', 'v2'],
};

function renderSection(reviewed: string[] = [], onToggleSection = vi.fn()) {
  render(
    <TierSection
      reportId="a__b"
      section={SECTION}
      cards={SECTION.cards}
      sides={{ a: 'main-2026-08-17', b: 'main-2026-08-13' }}
      reviewed={new Set(reviewed)}
      collapsed={false}
      onCollapse={vi.fn()}
      onToggleSection={onToggleSection}
      onToggleCard={vi.fn()}
      onCompare={vi.fn()}
    />,
  );

  return onToggleSection;
}

const sectionBox = () =>
  within(screen.getByRole('region', { name: 'atoms' })).getAllByRole(
    'checkbox',
  )[0] as HTMLInputElement;

/**
 * What the control reports, as one word.
 *
 * `indeterminate` is a DOM property with no attribute form and `aria-checked`
 * only carries `mixed`, so the three states are read from two different places —
 * which is exactly the kind of thing a test through the template would get wrong
 * without noticing.
 */
const state = () => {
  const box = sectionBox();
  if (box.getAttribute('aria-checked') === 'mixed') return 'mixed';

  return box.checked ? 'checked' : 'unchecked';
};

describe('the tier checkbox', () => {
  it('is unchecked with nothing reviewed', () => {
    renderSection([]);

    expect(state()).toBe('unchecked');
  });

  /** Half done is neither: `mixed` is what tells a reviewer there is work left in
   *  a tier they have started. */
  it('is mixed with some of the tier reviewed', () => {
    renderSection(['v1']);

    expect(state()).toBe('mixed');
  });

  it('is checked only when the whole tier is reviewed', () => {
    renderSection(['v1', 'v2']);

    expect(state()).toBe('checked');
  });

  /** The press nothing exercised. One press marks every variant in the tier. */
  it('marks the whole section when pressed', () => {
    const onToggleSection = renderSection([]);

    fireEvent.click(sectionBox() as Element);

    expect(onToggleSection).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'atoms' }),
      true,
    );
  });

  it('unmarks the whole section when it was already complete', () => {
    const onToggleSection = renderSection(['v1', 'v2']);

    fireEvent.click(sectionBox() as Element);

    expect(onToggleSection).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'atoms' }),
      false,
    );
  });
});

describe('what the section says about itself', () => {
  it('names the tier as its own region', () => {
    renderSection();

    expect(screen.getByRole('region', { name: 'atoms' })).toBeTruthy();
  });

  it('reports progress over its own variants, not the filtered cards', () => {
    renderSection(['v1']);

    expect(screen.getByText(/1\/2/)).toBeTruthy();
  });
});
