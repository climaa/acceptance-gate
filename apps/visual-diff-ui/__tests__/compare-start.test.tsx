// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { useLayoutEffect } from 'react';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.tsx` include means tsc typechecks this file.
import { afterEach, describe, expect, it } from 'vitest';
import {
  type ComparePair,
  CompareStartProvider,
  useCompareStart,
  useHandleCompareStart,
} from '../components/CompareStart';

/**
 * The seam between the pickers' press and the run panel's start.
 *
 * console.test.tsx reaches it through the whole console, where a press lands
 * after React has finished with a commit. A real press can land sooner: between
 * the commit that draws a new state (D1's running alert) and the passive effects
 * that follow it. A layout effect runs in exactly that window, so the probe below
 * presses from one, and the press must reach the handler of the commit it sees.
 */

afterEach(() => {
  cleanup();
});

const PAIR: ComparePair = { baseline: 'main-2026-08-17', candidate: 'wip-2026-08-16' };

describe('the compare press', () => {
  it('reaches the handler of the commit it lands in, before passive effects', () => {
    // Arrange
    const seen: boolean[] = [];

    function Panel({ running }: { running: boolean }) {
      useHandleCompareStart(() => seen.push(running));

      return null;
    }

    function Press({ running }: { running: boolean }) {
      const startCompare = useCompareStart();

      useLayoutEffect(() => {
        if (running) startCompare(PAIR);
      }, [running, startCompare]);

      return null;
    }

    const tree = (running: boolean) => (
      <CompareStartProvider>
        <Panel running={running} />
        <Press running={running} />
      </CompareStartProvider>
    );
    const { rerender } = render(tree(false));

    // Act
    rerender(tree(true));

    // Assert
    expect(seen).toEqual([true]);
  });
});
