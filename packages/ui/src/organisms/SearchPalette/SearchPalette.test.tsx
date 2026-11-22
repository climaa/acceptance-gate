import { FULLPAGE_TAG } from '@gate/visual-diff/policy';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import axe from 'axe-core';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SearchEntry } from './search';
import { SearchPalette, type SearchPaletteProps } from './SearchPalette';
import paletteStories from './SearchPalette.stories';

afterEach(cleanup);

afterEach(() => {
  document.body.style.overflow = '';
});

const INDEX: SearchEntry[] = [
  { id: 'f1', kind: 'file', title: 'packages/ui/src/organisms/Table/Table.tsx' },
  { id: 'g1', kind: 'gap', title: 'Table', meta: 'component-incomplete' },
  { id: 'c1', kind: 'component', title: 'Table', meta: 'organisms · @gate/ui' },
];

const paletteWith = (props: Partial<SearchPaletteProps> = {}) => (
  <SearchPalette
    open
    onClose={() => {}}
    onSelect={() => {}}
    onQueryChange={() => {}}
    entries={INDEX}
    query="table"
    {...props}
  />
);

const openPalette = (props: Partial<SearchPaletteProps> = {}) =>
  render(paletteWith(props));

const input = () => screen.getByRole('combobox', { name: 'Search' });
const options = () => screen.getAllByRole('option');
const activeOption = () => {
  const id = input().getAttribute('aria-activedescendant');
  return id ? document.getElementById(id) : null;
};
const press = (key: string) => fireEvent.keyDown(input(), { key });
const closeButton = () => screen.getByRole('button', { name: 'Close search' });

describe('SearchPalette', () => {
  it('is a modal dialog named for what it searches', () => {
    openPalette();

    const dialog = screen.getByRole('dialog', { name: 'Search' });

    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('renders nothing when closed', () => {
    openPalette({ open: false });

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('draws one labelled group per kind, in the palette order', () => {
    openPalette();

    const groups = screen.getAllByRole('group').map((group) => [
      group.getAttribute('aria-label'),
      within(group)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ]);

    expect(groups).toEqual([
      ['Components', ['Tableorganisms · @gate/ui']],
      ['Files', ['packages/ui/src/organisms/Table/Table.tsx']],
      ['Gaps', ['Tablecomponent-incomplete']],
    ]);
  });

  it('shows the query it was given and reports each edit', () => {
    const onQueryChange = vi.fn();
    openPalette({ onQueryChange });

    fireEvent.change(input(), { target: { value: 'tables' } });

    expect(onQueryChange).toHaveBeenCalledWith('tables');
  });

  it('says so when a query matches nothing', () => {
    openPalette({ query: 'zzz' });

    expect(screen.queryAllByRole('option')).toHaveLength(0);
    screen.getByText('No results for “zzz”');
  });

  it('draws no list for a blank query', () => {
    openPalette({ query: '' });

    expect(screen.queryByRole('listbox')).toBeNull();
    expect(input().getAttribute('aria-expanded')).toBe('false');
  });

  it('has no axe violations open with results', async () => {
    openPalette();

    const { violations } = await axe.run(document.body);

    expect(violations.map((violation) => violation.id)).toEqual([]);
  });

  it('is captured whole-page, since it is fixed over the viewport', () => {
    const tags = paletteStories.tags;

    expect(tags).toEqual([FULLPAGE_TAG]);
  });
});

describe('the keyboard contract', () => {
  it('focuses the input on open with the first result active', () => {
    openPalette();

    expect(document.activeElement).toBe(input());
    expect(activeOption()).toBe(options()[0]);
    expect(options()[0]?.getAttribute('aria-selected')).toBe('true');
  });

  it('moves down across group boundaries with ArrowDown', () => {
    openPalette();

    press('ArrowDown');
    press('ArrowDown');

    expect(activeOption()?.textContent).toBe('Tablecomponent-incomplete');
  });

  it('wraps from the last result to the first, and back with ArrowUp', () => {
    openPalette();

    press('ArrowUp');
    const wrappedToLast = activeOption();
    press('ArrowDown');

    expect(wrappedToLast).toBe(options().at(-1));
    expect(activeOption()).toBe(options()[0]);
  });

  it('follows the active result with Enter', () => {
    const onSelect = vi.fn();
    openPalette({ onSelect });
    press('ArrowDown');

    press('Enter');

    expect(onSelect).toHaveBeenCalledWith(INDEX[0]);
  });

  it('follows a result that is clicked', () => {
    const onSelect = vi.fn();
    openPalette({ onSelect });

    fireEvent.click(screen.getByRole('option', { name: /component-incomplete/ }));

    expect(onSelect).toHaveBeenCalledWith(INDEX[1]);
  });

  it('does nothing on Enter when there is no result to follow', () => {
    const onSelect = vi.fn();
    openPalette({ onSelect, query: 'zzz' });

    press('Enter');

    expect(onSelect).not.toHaveBeenCalled();
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    openPalette({ onClose });

    press('Escape');

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('wraps Shift+Tab from the input round to the close button', () => {
    openPalette();

    fireEvent.keyDown(input(), { key: 'Tab', shiftKey: true });

    expect(document.activeElement).toBe(closeButton());
  });

  it('wraps Tab from the close button back to the input', () => {
    openPalette();
    closeButton().focus();

    fireEvent.keyDown(closeButton(), { key: 'Tab' });

    expect(document.activeElement).toBe(input());
  });

  it('closes from the Esc button, the path a touch screen has', () => {
    const onClose = vi.fn();
    openPalette({ onClose });

    fireEvent.click(closeButton());

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('closes on a click on the scrim', () => {
    const onClose = vi.fn();
    openPalette({ onClose });

    fireEvent.click(document.querySelector('.ds-search-palette__backdrop')!);

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('starts again from the first result when the query changes', () => {
    const { rerender } = openPalette();
    press('ArrowDown');

    rerender(paletteWith({ query: 'tab' }));

    expect(activeOption()).toBe(options()[0]);
  });

  it('returns focus to whatever opened it once Escape closes it', () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      const [query, setQuery] = useState('table');
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open search
          </button>
          {paletteWith({
            open,
            query,
            onQueryChange: setQuery,
            onClose: () => setOpen(false),
          })}
        </>
      );
    }
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open search' });
    opener.focus();
    fireEvent.click(opener);

    press('Escape');

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});
