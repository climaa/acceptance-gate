// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.tsx` include means tsc typechecks this file.
import { afterEach, describe, expect, it } from 'vitest';
import NoShot from '../app/set/[label]/@modal/default';
import SetLayout from '../app/set/[label]/layout';

/**
 * The set and the slot a screenshot opens in over it. What this layout decides
 * is that both are drawn, the set first, and that it adds nothing of its own:
 * no wrapper the set viewer's scroll or the modal's stacking would have to
 * reckon with. The slot's contents are their own suites' — here they are
 * stand-ins, plus the real `@modal/default.tsx` for the cold-load case.
 */

type LayoutArgs = Parameters<typeof SetLayout>[0];

const propsFor = (children: LayoutArgs['children'], modal: LayoutArgs['modal']) =>
  ({ children, modal, params: Promise.resolve({ label: 'main' }) }) as LayoutArgs;

afterEach(() => {
  cleanup();
});

describe('app/set/[label]/layout.tsx', () => {
  // The intercepted route: a screenshot in the set viewer was pressed.
  it('draws the set, then the screenshot over it', () => {
    // Arrange
    const props = propsFor(<main>set</main>, <dialog open>screenshot</dialog>);

    // Act
    const { container } = render(<SetLayout {...props} />);

    // Assert
    const set = screen.getByRole('main');
    const shot = screen.getByRole('dialog');
    expect(set.textContent).toBe('set');
    expect(shot.textContent).toBe('screenshot');
    expect(container.children).toHaveLength(2);
    expect(container.children[0]).toBe(set);
    expect(container.children[1]).toBe(shot);
  });

  // Loaded cold, the slot falls back to `@modal/default.tsx`.
  it('draws the set alone when no screenshot is open', () => {
    // Arrange
    const props = propsFor(<main>set</main>, <NoShot />);

    // Act
    const { container } = render(<SetLayout {...props} />);

    // Assert
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(container.children).toHaveLength(1);
    expect(container.firstElementChild).toBe(screen.getByRole('main'));
  });
});
