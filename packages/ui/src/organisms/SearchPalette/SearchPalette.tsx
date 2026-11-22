'use client';

import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

import {
  groupResults,
  type SearchEntry,
  type SearchGroup,
  type SearchKind,
} from './search';

export interface SearchPaletteProps {
  /** Closed renders nothing. */
  open: boolean;
  /** Escape, the Esc button and the scrim all call it; `open` stays the caller's. */
  onClose: () => void;
  /** The caller's index, every kind in one list. */
  entries: readonly SearchEntry[];
  /** Controlled: the palette shows this query and reports edits to it. */
  query: string;
  onQueryChange: (query: string) => void;
  /** Enter on the active result, or a click on any. The caller decides where it leads. */
  onSelect: (entry: SearchEntry) => void;
  /** The dialog's and the input's accessible name. */
  label?: string;
  placeholder?: string;
  className?: string;
}

const GROUP_LABEL: Record<SearchKind, string> = {
  workspace: 'Workspaces',
  component: 'Components',
  file: 'Files',
  gap: 'Gaps',
  scenario: 'Scenarios',
};

const svgProps = {
  'aria-hidden': true,
  viewBox: '0 0 24 24',
  width: 16,
  height: 16,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

const PAGE = 'M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z M14 3v5h5';

const KIND_ICON: Record<SearchKind, ReactNode> = {
  workspace: (
    <svg {...svgProps}>
      <path d="M3 7a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
    </svg>
  ),
  component: (
    <svg {...svgProps}>
      <path d="M12 2.5l3 3-3 3-3-3z M5.5 9l3 3-3 3-3-3z M18.5 9l3 3-3 3-3-3z M12 15.5l3 3-3 3-3-3z" />
    </svg>
  ),
  file: (
    <svg {...svgProps}>
      <path d={PAGE} />
    </svg>
  ),
  gap: (
    <svg {...svgProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5 M12 16.5v.01" />
    </svg>
  ),
  scenario: (
    <svg {...svgProps}>
      <path d="M5 4h14v16H5z M9 9h6 M9 13h6 M9 17h3" />
    </svg>
  ),
};

/** A source file gets the page with brackets on it, as the tile draws `Table.tsx`. */
const CODE_FILE = /\.(?:[cm]?[jt]sx?)$/;

const iconFor = (entry: SearchEntry) =>
  entry.kind === 'file' && CODE_FILE.test(entry.title) ? (
    <svg {...svgProps}>
      <path d={PAGE} />
      <path d="M10.5 12.5l-1.5 1.5 1.5 1.5 M13.5 12.5l1.5 1.5-1.5 1.5" />
    </svg>
  ) : (
    KIND_ICON[entry.kind]
  );

const SEARCH_ICON = (
  <svg {...svgProps} width={18} height={18}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </svg>
);

/** Tab stops, in document order: the input and the Esc button. */
const focusablesIn = (surface: HTMLElement) => [
  ...surface.querySelectorAll<HTMLElement>('input, button'),
];

const wrapTab = (surface: HTMLElement, event: KeyboardEvent) => {
  const stops = focusablesIn(surface);
  const leavingFrom = event.shiftKey ? stops[0] : stops.at(-1);
  const wrapTo = event.shiftKey ? stops.at(-1) : stops[0];

  if (!wrapTo || surface.ownerDocument.activeElement !== leavingFrom) return;

  event.preventDefault();
  wrapTo.focus();
};

/**
 * Census's ⌘K palette: a modal dialog holding a search input and the matching
 * entries of the caller's index, grouped by kind. Presentational — the index,
 * the query and what a result leads to are all the caller's; the one thing it
 * keeps is which result is active.
 *
 * The keyboard contract is the combobox's: focus stays in the input, ↑/↓ move the
 * active result (wrapping, across groups), Enter follows it, Escape closes and
 * focus returns to whatever opened the palette.
 *
 * Below 768px the same markup is a bottom sheet; the media query in
 * SearchPalette.css is the only switch. The Esc chip is a real button, because a
 * touch screen has no Escape key.
 */
export function SearchPalette({ open, ...props }: SearchPaletteProps) {
  if (!open) return null;
  // A component of its own so the focus, key and scroll effects exist exactly
  // while the palette does — the same split Dialog makes.
  return <PaletteSurface {...props} />;
}

function PaletteSurface({
  onClose,
  entries,
  query,
  onQueryChange,
  onSelect,
  label = 'Search',
  placeholder = 'Search workspaces, files, components…',
  className,
}: Omit<SearchPaletteProps, 'open'>) {
  const [surface, setSurface] = useState<HTMLDivElement | null>(null);
  // The active result belongs to the query it was chosen under: a new query
  // starts again from the first result without an effect to reset it.
  const [cursor, setCursor] = useState({ query, index: 0 });
  const baseId = useId();

  const groups = groupResults(entries, query);
  const flat = groups.flatMap((group) => group.entries);
  const active = cursor.query === query ? Math.min(cursor.index, flat.length - 1) : 0;
  const optionId = (index: number) => `${baseId}-option-${index}`;
  const listId = `${baseId}-list`;
  const hasResults = flat.length > 0;

  useEffect(() => {
    if (!surface) return;

    const opener = surface.ownerDocument.activeElement;
    focusablesIn(surface)[0]?.focus();

    return () => {
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, [surface]);

  useEffect(() => {
    if (!surface) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') return onClose();
      if (event.key === 'Tab') wrapTab(surface, event);
    };

    const doc = surface.ownerDocument;
    doc.addEventListener('keydown', onKeyDown);
    return () => doc.removeEventListener('keydown', onKeyDown);
  }, [surface, onClose]);

  useEffect(() => {
    const { body } = document;
    const previous = body.style.overflow;

    body.style.overflow = 'hidden';
    return () => {
      body.style.overflow = previous;
    };
  }, []);

  // jsdom has no scrollIntoView; browsers all do.
  useEffect(() => {
    if (hasResults)
      document.getElementById(optionId(active))?.scrollIntoView?.({ block: 'nearest' });
  });

  const move = (step: number) =>
    setCursor({ query, index: (active + step + flat.length) % flat.length });

  const onInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
    if (step !== undefined && hasResults) {
      event.preventDefault();
      move(step);
    }
    const entry = flat[active];
    if (event.key === 'Enter' && entry) {
      event.preventDefault();
      onSelect(entry);
    }
  };

  const tree = (
    <div className={['ds-search-palette', className].filter(Boolean).join(' ')}>
      <div className="ds-search-palette__backdrop" onClick={onClose} />

      <div
        ref={setSurface}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="ds-search-palette__surface"
      >
        <div aria-hidden="true" className="ds-search-palette__grabber" />

        <div className="ds-search-palette__field">
          <span className="ds-search-palette__search-icon">{SEARCH_ICON}</span>
          <input
            type="text"
            role="combobox"
            aria-label={label}
            aria-expanded={hasResults}
            aria-controls={hasResults ? listId : undefined}
            aria-autocomplete="list"
            aria-activedescendant={hasResults ? optionId(active) : undefined}
            autoComplete="off"
            spellCheck={false}
            placeholder={placeholder}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={onInputKeyDown}
            className="ds-search-palette__input"
          />
          <button
            type="button"
            aria-label="Close search"
            className="ds-search-palette__kbd ds-search-palette__close"
            onClick={onClose}
          >
            Esc
          </button>
        </div>

        <Results
          groups={groups}
          query={query}
          listId={listId}
          optionId={optionId}
          active={active}
          onSelect={onSelect}
        />

        <KeyHints />
      </div>
    </div>
  );

  // Into <body> for the reason Dialog gives: `aria-modal` has to be true of the
  // tree the palette sits in, and nothing outside it is made inert.
  if (typeof document === 'undefined') return null;

  return createPortal(tree, document.body);
}

interface ResultsProps {
  groups: SearchGroup[];
  query: string;
  listId: string;
  optionId: (index: number) => string;
  active: number;
  onSelect: (entry: SearchEntry) => void;
}

function Results({ groups, query, listId, optionId, active, onSelect }: ResultsProps) {
  if (groups.length === 0) {
    return query.trim() === '' ? null : (
      <p role="status" className="ds-search-palette__empty">
        No results for “{query}”
      </p>
    );
  }

  let index = 0;

  return (
    <div
      id={listId}
      role="listbox"
      aria-label="Results"
      className="ds-search-palette__list"
    >
      {groups.map((group) => (
        <div
          key={group.kind}
          role="group"
          aria-label={GROUP_LABEL[group.kind]}
          className="ds-search-palette__group"
        >
          <div aria-hidden="true" className="ds-search-palette__heading">
            {GROUP_LABEL[group.kind]}
          </div>
          {group.entries.map((entry) => {
            const at = index++;
            return (
              <Option
                key={entry.id}
                id={optionId(at)}
                entry={entry}
                selected={at === active}
                onSelect={onSelect}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

interface OptionProps {
  id: string;
  entry: SearchEntry;
  selected: boolean;
  onSelect: (entry: SearchEntry) => void;
}

function Option({ id, entry, selected, onSelect }: OptionProps) {
  return (
    <div
      id={id}
      role="option"
      aria-selected={selected}
      data-kind={entry.kind}
      className="ds-search-palette__option"
      // Focus stays in the input: a mouse-down on an option must not take it.
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => onSelect(entry)}
    >
      <span className="ds-search-palette__icon">{iconFor(entry)}</span>
      <span className="ds-search-palette__title">{entry.title}</span>
      {entry.meta && <span className="ds-search-palette__meta">{entry.meta}</span>}
    </div>
  );
}

/** Sighted readers' copy of the keyboard contract; the combobox role is everyone else's. */
function KeyHints() {
  return (
    <div aria-hidden="true" className="ds-search-palette__hints">
      <span className="ds-search-palette__hint">
        <kbd className="ds-search-palette__kbd">↑↓</kbd> move
      </span>
      <span className="ds-search-palette__hint">
        <kbd className="ds-search-palette__kbd">↵</kbd> open
      </span>
      <span className="ds-search-palette__hint">
        <kbd className="ds-search-palette__kbd">Esc</kbd> close
      </span>
    </div>
  );
}
