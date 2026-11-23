'use client';

import { type ReactNode, useEffect, useState, useSyncExternalStore } from 'react';

import { SearchPalette, Sidebar, TopBar, type SearchEntry } from '@gate/ui';
import type { HomeFilter } from '@/lib/filter.ts';
import type { HomeView } from '@/lib/home.ts';
import type { SearchIndex } from '@/lib/search.ts';
import { DIMENSION_LABEL } from '@/lib/trend.ts';

/** Sidebar's breakpoint: below it the sidebar is a drawer, closed until asked. */
const DRAWER_QUERY = '(width < 768px)';

const SIDEBAR_ID = 'census-sidebar';

const subscribeToDrawer = (onChange: () => void) => {
  const query = window.matchMedia(DRAWER_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
};
const isDrawerWidth = () => window.matchMedia(DRAWER_QUERY).matches;
const noSubscription = () => () => {};

export interface CensusShellProps {
  view: HomeView;
  filter: HomeFilter;
  children: ReactNode;
}

const NO_SEARCH: SearchIndex = { entries: [], hrefs: {} };

/** A gap leads to its row on this page; everything else, to GitHub. */
function follow(href: string | undefined) {
  if (href === undefined) return;
  if (href.startsWith('#')) window.location.hash = href;
  else window.location.assign(href);
}

/**
 * Census's frame on every route: the sidebar with the dimensions, the top bar,
 * and the search palette ⌘K opens. Presentational over its props; the only state
 * it keeps is its own — whether the sidebar is folded and whether search is open.
 *
 * The sidebar's one `collapsed` means "rail" at desktop width and "drawer closed"
 * below it, so the right value depends on a viewport the server cannot see. The
 * server renders the desktop column; until hydration `globals.css` keeps the
 * drawer shut below 768px (`[data-ready]`), and after it the media query picks.
 */
export function CensusShell({ view, filter, children }: CensusShellProps) {
  const { githubHref } = view;
  const search = view.state === 'measured' ? view.search : NO_SEARCH;
  const lit = filter.dimension ?? 'overview';
  const dimensions = view.dimensions.map((d) => ({ ...d, current: d.id === lit }));
  const here = filter.dimension === null ? 'Overview' : DIMENSION_LABEL[filter.dimension];
  // `false` on the server and through hydration, `true` after: the first
  // client render must match the markup the server sent.
  const ready = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
  const drawer = useSyncExternalStore(subscribeToDrawer, isDrawerWidth, () => false);
  // Two states, because the drawer and the rail are two choices: opening the
  // drawer on a phone must not fold the column on a later, wider window.
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');

  const collapsed = drawer ? !drawerOpen : railCollapsed;
  const setCollapsed = (next: boolean) =>
    drawer ? setDrawerOpen(!next) : setRailCollapsed(next);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setSearching(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="census-shell" data-ready={ready || undefined}>
      <Sidebar
        id={SIDEBAR_ID}
        repository="acceptance-gate"
        title="census"
        dimensionsLabel="Dimensions"
        dimensions={dimensions}
        workspaces={view.workspaces}
        collapsed={collapsed}
        onCollapsedChange={setCollapsed}
      />
      <div className="census-shell__column">
        <TopBar
          breadcrumb={[
            { label: 'acceptance-gate', href: githubHref },
            { label: 'census', href: '/' },
            { label: here },
          ]}
          onSearch={() => setSearching(true)}
          githubHref={githubHref}
          onMenuClick={() => setCollapsed(false)}
          menuExpanded={!collapsed}
          menuControls={SIDEBAR_ID}
        />
        {children}
      </div>
      <SearchPalette
        open={searching}
        onClose={() => setSearching(false)}
        // Built at build from the measurement (`lib/search.ts`).
        entries={search.entries}
        query={query}
        onQueryChange={setQuery}
        onSelect={(entry: SearchEntry) => {
          setSearching(false);
          follow(search.hrefs[entry.id]);
        }}
      />
    </div>
  );
}
