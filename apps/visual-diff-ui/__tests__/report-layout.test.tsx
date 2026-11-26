// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.tsx` include means tsc typechecks this file.
import { afterEach, describe, expect, it } from 'vitest';
import NoComparison from '../app/report/[id]/@modal/default';
import ReportLayout from '../app/report/[id]/layout';

/**
 * The report and the slot a comparison opens in over it. What this layout
 * decides is that both are drawn, the report first, and that it adds nothing
 * of its own: no wrapper an e2e locator or the modal's stacking would have to
 * reckon with. The slot's contents are their own suites' — here they are
 * stand-ins, plus the real `@modal/default.tsx` for the cold-load case.
 */

type LayoutArgs = Parameters<typeof ReportLayout>[0];

const propsFor = (children: LayoutArgs['children'], modal: LayoutArgs['modal']) =>
  ({ children, modal, params: Promise.resolve({ id: 'main' }) }) as LayoutArgs;

afterEach(() => {
  cleanup();
});

describe('app/report/[id]/layout.tsx', () => {
  // The intercepted route: a compare tool on this report opened a comparison.
  it('draws the report, then the comparison over it', () => {
    // Arrange
    const props = propsFor(<main>report</main>, <dialog open>comparison</dialog>);

    // Act
    const { container } = render(<ReportLayout {...props} />);

    // Assert
    const report = screen.getByRole('main');
    const comparison = screen.getByRole('dialog');
    expect(report.textContent).toBe('report');
    expect(comparison.textContent).toBe('comparison');
    expect(container.children).toHaveLength(2);
    expect(container.children[0]).toBe(report);
    expect(container.children[1]).toBe(comparison);
  });

  // Loaded cold, the slot falls back to `@modal/default.tsx`.
  it('draws the report alone when no comparison is open', () => {
    // Arrange
    const props = propsFor(<main>report</main>, <NoComparison />);

    // Act
    const { container } = render(<ReportLayout {...props} />);

    // Assert
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(container.children).toHaveLength(1);
    expect(container.firstElementChild).toBe(screen.getByRole('main'));
  });
});
