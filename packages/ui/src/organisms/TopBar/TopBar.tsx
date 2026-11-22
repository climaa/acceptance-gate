import { IconButton, ThemeToggle } from '../../atoms';
import { Breadcrumb, type BreadcrumbItem } from '../../molecules';

export interface TopBarProps {
  /** Where the reader is; the last crumb is the current page. */
  breadcrumb: BreadcrumbItem[];
  /** Opens the search palette. The caller binds ⌘K to the same handler. */
  onSearch: () => void;
  searchPlaceholder?: string;
  /** The repository on GitHub. No href, no link. */
  githubHref?: string;
  /**
   * Opens the sidebar's drawer below 768px. No handler, no menu button: a page
   * without a drawer has nothing for it to open.
   */
  onMenuClick?: () => void;
  /** Whether the drawer the menu button controls is open. */
  menuExpanded?: boolean;
  /** The drawer's id, for `aria-controls`. */
  menuControls?: string;
  className?: string;
}

const svgProps = {
  'aria-hidden': true,
  viewBox: '0 0 24 24',
  width: 16,
  height: 16,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

const MENU_ICON = (
  <svg {...svgProps}>
    <path d="M4 7h16 M4 12h16 M4 17h16" />
  </svg>
);

const SEARCH_ICON = (
  <svg {...svgProps}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </svg>
);

/**
 * Census's top bar: the menu button that opens the sidebar's drawer (mobile
 * only), the breadcrumb, a ⌘K search trigger, the GitHub link and the theme
 * toggle. Presentational — what search opens and whether the drawer is open
 * are the caller's.
 *
 * Below 768px the search trigger folds to its glyph, GitHub leaves and the
 * breadcrumb keeps its last two crumbs; Sidebar's breakpoint, so the menu button
 * shows exactly while the sidebar is a drawer.
 */
export function TopBar({
  breadcrumb,
  onSearch,
  searchPlaceholder = 'Search workspaces, files, gaps…',
  githubHref,
  onMenuClick,
  menuExpanded = false,
  menuControls,
  className,
}: TopBarProps) {
  return (
    <header className={['ds-topbar', className].filter(Boolean).join(' ')}>
      {onMenuClick && (
        <IconButton
          label="Open navigation"
          size="sm"
          className="ds-topbar__menu"
          aria-expanded={menuExpanded}
          aria-controls={menuControls}
          onClick={onMenuClick}
        >
          {MENU_ICON}
        </IconButton>
      )}

      <Breadcrumb items={breadcrumb} className="ds-topbar__breadcrumb" />

      <div className="ds-topbar__end">
        <button
          type="button"
          className="ds-topbar__search"
          aria-label="Search"
          aria-keyshortcuts="Meta+K"
          onClick={onSearch}
        >
          {SEARCH_ICON}
          <span className="ds-topbar__placeholder" aria-hidden="true">
            {searchPlaceholder}
          </span>
          <kbd className="ds-topbar__kbd" aria-hidden="true">
            ⌘K
          </kbd>
        </button>

        {githubHref && (
          <a href={githubHref} className="ds-topbar__github">
            GitHub
          </a>
        )}

        <ThemeToggle className="ds-topbar__theme" />
      </div>
    </header>
  );
}
