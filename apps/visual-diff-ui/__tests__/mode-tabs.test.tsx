// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
// Imported explicitly rather than relying on `globals: true` — tsconfig's
// `**/*.ts` include means tsc typechecks this file.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type Mode, ModeTabs, PANEL_ID, isMode, tabId } from '../components/ModeTabs';

/**
 * The job-mode tablist, on its own.
 *
 * It was part of RunPanel until the split, and the panel's suite exercised it the
 * way a reviewer does — press ArrowRight, check the panel followed. That covered
 * one of the six keys the tablist binds: `ArrowRight` and its wrap. `ArrowLeft`,
 * `ArrowUp`, `ArrowDown`, `Home` and `End` were each a handler nothing called,
 * which is what took this file to 64% of its functions while every test passed.
 *
 * Tested here rather than through the panel because the failure that matters is a
 * key that stops moving the selection, and through the panel that reads as a form
 * that did not change — one layer from the cause. The panel's own cases stay where
 * they are: what the URL records and what the start button says are its business,
 * not this one's.
 */

afterEach(cleanup);

const tab = (mode: Mode) => screen.getByRole('tab', { name: mode });

function renderTabs(mode: Mode = 'capture') {
  const onSelect = vi.fn();
  render(<ModeTabs mode={mode} onSelect={onSelect} />);

  return onSelect;
}

describe('the tablist', () => {
  it('marks the selected tab and no other', () => {
    renderTabs('capture');

    expect(tab('capture').getAttribute('aria-selected')).toBe('true');
    expect(tab('compare').getAttribute('aria-selected')).toBe('false');
  });

  /** One tab stop for the strip, not one per tab: a tablist where every tab is
   *  tabbable puts a stop in front of the fields for each mode. */
  it('gives the strip one tab stop', () => {
    renderTabs('compare');

    expect(tab('compare').getAttribute('tabindex')).toBe('0');
    expect(tab('capture').getAttribute('tabindex')).toBe('-1');
  });

  it('points every tab at the panel it controls', () => {
    renderTabs();

    for (const mode of ['capture', 'compare'] as const) {
      expect(tab(mode).getAttribute('aria-controls')).toBe(PANEL_ID);
      expect(tab(mode).id).toBe(tabId(mode));
    }
  });

  it('selects the tab that was clicked', () => {
    const onSelect = renderTabs('capture');

    fireEvent.click(tab('compare'));

    expect(onSelect).toHaveBeenCalledWith('compare');
  });
});

/**
 * Both axes, because the strip reads as a row above 768 px and stacks to a column
 * below it — a reviewer on a narrow screen presses Down for what looks like the
 * next tab.
 */
describe('the keys the tablist owns', () => {
  it.each([
    ['ArrowRight', 'capture', 'compare'],
    ['ArrowDown', 'capture', 'compare'],
    ['ArrowLeft', 'compare', 'capture'],
    ['ArrowUp', 'compare', 'capture'],
  ] as const)('%s moves from %s to %s', (key, from, to) => {
    const onSelect = renderTabs(from);

    fireEvent.keyDown(tab(from), { key });

    expect(onSelect).toHaveBeenCalledWith(to);
  });

  // Wrapping, not clamping: two modes and a strip that reads as a loop.
  it.each([
    ['ArrowRight', 'compare', 'capture'],
    ['ArrowLeft', 'capture', 'compare'],
  ] as const)('%s wraps from %s round to %s', (key, from, to) => {
    const onSelect = renderTabs(from);

    fireEvent.keyDown(tab(from), { key });

    expect(onSelect).toHaveBeenCalledWith(to);
  });

  it.each([
    ['Home', 'compare', 'capture'],
    ['End', 'capture', 'compare'],
  ] as const)('%s jumps from %s to %s', (key, from, to) => {
    const onSelect = renderTabs(from);

    fireEvent.keyDown(tab(from), { key });

    expect(onSelect).toHaveBeenCalledWith(to);
  });

  /** Focus follows the selection, because the roving `tabIndex` is about to make
   *  the tab under it untabbable — leaving focus there would send the next Tab
   *  out of the tablist from a stop that no longer exists. */
  it('moves focus to the tab it selected', () => {
    renderTabs('capture');

    fireEvent.keyDown(tab('capture'), { key: 'End' });

    expect(document.activeElement).toBe(tab('compare'));
  });

  /** A key the tablist does not bind must reach whatever is next — `Tab` leaves
   *  the strip, and a letter belongs to the field below it. */
  it('leaves a key it does not own alone', () => {
    const onSelect = renderTabs('capture');

    fireEvent.keyDown(tab('capture'), { key: 'a' });
    fireEvent.keyDown(tab('capture'), { key: 'Enter' });

    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe('isMode', () => {
  it('accepts the two modes the runner has', () => {
    expect(isMode('capture')).toBe(true);
    expect(isMode('compare')).toBe(true);
  });

  /** A stale `?mode=accept` link is an unknown mode, not a crash: the two retired
   *  tabs are readable in history and not writable here. */
  it.each(['accept', 'run', '', 'CAPTURE', null])('refuses %o', (value) => {
    expect(isMode(value)).toBe(false);
  });
});
