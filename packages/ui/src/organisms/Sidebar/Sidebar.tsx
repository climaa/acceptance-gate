'use client';

import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useRef,
} from 'react';

import { IconButton } from '../../atoms';
import { groupWorkspaces } from './groups';

/** Census's dimensions, plus the overview of all four. Picks the row's icon. */
export type SidebarDimensionId = 'overview' | 'code' | 'visual' | 'acceptance' | 'health';

export interface SidebarDimension {
  id: SidebarDimensionId;
  label: string;
  href: string;
  /** Open gaps. Shown beside the label, and as a dot on the rail when above 0. */
  count?: number;
  current?: boolean;
}

export type SidebarCategory = 'packages' | 'apps' | 'scripts';

/**
 * The workspace's Code dimension, never its gaps. `measured`: it has coverage, at
 * any level; `unmeasured`: it has code and no coverage; `not-applicable`: no code.
 */
export type SidebarWorkspaceStatus = 'measured' | 'unmeasured' | 'not-applicable';

export interface SidebarWorkspace {
  name: string;
  href: string;
  category: SidebarCategory;
  status: SidebarWorkspaceStatus;
  current?: boolean;
}

export interface SidebarProps {
  /** The small line over the title: the measured repository. */
  repository: string;
  /** The brand's title. */
  title: string;
  /** Where the brand points. Defaults to the root. */
  homeHref?: string;
  dimensions: readonly SidebarDimension[];
  workspaces: readonly SidebarWorkspace[];
  /** Heading over the dimensions. */
  dimensionsLabel?: string;
  /**
   * Controlled. At 768px and up, `true` is the 56px rail; below, the sidebar is a
   * drawer and `true` is closed.
   */
  collapsed: boolean;
  /** The toggle, the drawer's close button, its scrim and Escape all call it. */
  onCollapsedChange: (collapsed: boolean) => void;
  /** The landmark's id, for a menu button elsewhere to name in `aria-controls`. */
  id?: string;
  className?: string;
}

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

const DIMENSION_ICON: Record<SidebarDimensionId, ReactNode> = {
  overview: (
    <svg {...svgProps}>
      <path d="M4 4h6v6H4z M14 4h6v4h-6z M14 12h6v8h-6z M4 14h6v6H4z" />
    </svg>
  ),
  // lucide `code`, ISC License, Copyright (c) Lucide Contributors — https://lucide.dev
  code: (
    <svg {...svgProps}>
      <path d="m16 18 6-6-6-6 M8 6l-6 6 6 6" />
    </svg>
  ),
  // lucide `image`, ISC License, Copyright (c) Lucide Contributors — https://lucide.dev
  visual: (
    <svg {...svgProps}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </svg>
  ),
  acceptance: (
    <svg {...svgProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 12.5l2.5 2.5 4.5-5" />
    </svg>
  ),
  health: (
    <svg {...svgProps}>
      <path d="M12 20s-8-4.6-8-10.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.5C20 15.4 12 20 12 20z M3.5 12h5l1.5-2 2 4 1.5-2h7" />
    </svg>
  ),
};

// lucide `scan`, ISC License, Copyright (c) Lucide Contributors — https://lucide.dev
const BRAND_ICON = (
  <svg {...svgProps} width={20} height={20}>
    <path d="M3 7V5a2 2 0 0 1 2-2h2 M17 3h2a2 2 0 0 1 2 2v2 M21 17v2a2 2 0 0 1-2 2h-2 M7 21H5a2 2 0 0 1-2-2v-2" />
  </svg>
);

const PANEL_ICON = (
  <svg {...svgProps}>
    <rect x="3.5" y="4" width="17" height="16" rx="2" />
    <path d="M9 4v16 M15 10l-2 2 2 2" />
  </svg>
);

const CLOSE_ICON = (
  <svg {...svgProps}>
    <path d="M6 6l12 12 M18 6L6 18" />
  </svg>
);

const STATUS_TEXT: Record<SidebarWorkspaceStatus, string> = {
  measured: 'code measured',
  unmeasured: 'code not measured',
  'not-applicable': 'no code',
};

const hasGaps = (count: number | undefined) => count !== undefined && count > 0;

/**
 * Census's shell navigation: the brand, the dimensions with their open gaps, and
 * the workspaces under their categories. Presentational — the lists, the current
 * entries and whether it is collapsed are all the caller's.
 *
 * One state, two shapes. At desktop width `collapsed` folds it to a 56px rail of
 * icons; below 768px the same markup is a drawer, and `collapsed` closes it. The
 * media query in Sidebar.css is the only switch, so the component needs no idea
 * of the viewport.
 *
 * Focus follows where the expansion came from rather than the viewport. Opened
 * from outside — the top bar's menu button — it behaves as a drawer: focus moves
 * to its close button, Escape closes it, and closing hands focus back to that
 * trigger. Expanded from its own toggle, as the desktop rail is, focus stays on
 * the toggle and Escape is left to the page.
 */
export function Sidebar({
  repository,
  title,
  homeHref = '/',
  dimensions,
  workspaces,
  dimensionsLabel = 'Layers',
  collapsed,
  onCollapsedChange,
  id,
  className,
}: SidebarProps) {
  const fallbackId = useId();
  const sidebarId = id ?? fallbackId;
  const root = useRef<HTMLElement>(null);
  const opener = useDrawerFocus(root, collapsed);

  const onKeyDown = (event: ReactKeyboardEvent) => {
    if (event.key === 'Escape' && !collapsed && opener.current) onCollapsedChange(true);
  };

  return (
    <>
      <nav
        ref={root}
        id={sidebarId}
        aria-label="Sidebar"
        className={['ds-sidebar', collapsed && 'ds-sidebar--collapsed', className]
          .filter(Boolean)
          .join(' ')}
        onKeyDown={onKeyDown}
      >
        <div className="ds-sidebar__head">
          <a href={homeHref} className="ds-sidebar__brand">
            <span className="ds-sidebar__brand-icon">{BRAND_ICON}</span>
            <span className="ds-sidebar__brand-text ds-sidebar__fold">
              <span className="ds-sidebar__repository">{repository}</span>{' '}
              <span className="ds-sidebar__title">{title}</span>
            </span>
          </a>
          <IconButton
            label="Close navigation"
            size="sm"
            className="ds-sidebar__close"
            onClick={() => onCollapsedChange(true)}
          >
            {CLOSE_ICON}
          </IconButton>
        </div>

        <div className="ds-sidebar__body">
          <section className="ds-sidebar__section">
            <h2 className="ds-sidebar__heading ds-sidebar__fold">{dimensionsLabel}</h2>
            <ul className="ds-sidebar__list">
              {dimensions.map((dimension) => (
                <DimensionRow key={dimension.id} dimension={dimension} />
              ))}
            </ul>
          </section>

          {!collapsed && workspaces.length > 0 && <Workspaces workspaces={workspaces} />}
        </div>

        <div className="ds-sidebar__foot">
          <button
            type="button"
            className="ds-sidebar__row ds-sidebar__toggle"
            aria-expanded={!collapsed}
            aria-controls={sidebarId}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={() => onCollapsedChange(!collapsed)}
          >
            <span className="ds-sidebar__icon">{PANEL_ICON}</span>
            <span className="ds-sidebar__label ds-sidebar__fold" aria-hidden="true">
              Collapse
            </span>
          </button>
        </div>
      </nav>

      {!collapsed && (
        <div
          aria-hidden="true"
          className="ds-sidebar__scrim"
          onClick={() => onCollapsedChange(true)}
        />
      )}
    </>
  );
}

/**
 * Records what had focus when the sidebar expanded, if it sat outside it, and
 * gives focus back to it on collapse. Returns that opener: its presence is what
 * makes the expanded sidebar a drawer rather than an inline column.
 */
function useDrawerFocus(root: RefObject<HTMLElement | null>, collapsed: boolean) {
  const opener = useRef<HTMLElement | null>(null);
  const previous = useRef(collapsed);

  useEffect(() => {
    const nav = root.current;
    if (!nav || previous.current === collapsed) return;
    previous.current = collapsed;

    const active = nav.ownerDocument.activeElement;
    if (!collapsed) {
      if (!(active instanceof HTMLElement) || nav.contains(active)) return;
      opener.current = active;
      nav.querySelector<HTMLElement>('.ds-sidebar__close')?.focus();
      return;
    }

    const trigger = opener.current;
    opener.current = null;
    // A closed drawer is display: none, so a browser has already dropped focus
    // to <body>; jsdom computes no styles and leaves it on the hidden control.
    if (trigger && (active === nav.ownerDocument.body || nav.contains(active))) {
      trigger.focus();
    }
  }, [root, collapsed]);

  return opener;
}

function DimensionRow({ dimension }: { dimension: SidebarDimension }) {
  const { id, label, href, count, current } = dimension;

  return (
    <li>
      <a
        href={href}
        className="ds-sidebar__row"
        aria-current={current ? 'page' : undefined}
        data-dimension={id}
      >
        <span className="ds-sidebar__icon">
          {DIMENSION_ICON[id]}
          {hasGaps(count) && <span className="ds-sidebar__badge" aria-hidden="true" />}
        </span>
        <span className="ds-sidebar__label ds-sidebar__fold">{label}</span>
        {count !== undefined && (
          <span
            className={[
              'ds-sidebar__count',
              'ds-sidebar__fold',
              hasGaps(count) && 'ds-sidebar__count--gaps',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <span className="ds-visually-hidden">, gaps: </span>
            {count}
          </span>
        )}
      </a>
    </li>
  );
}

function Workspaces({ workspaces }: { workspaces: readonly SidebarWorkspace[] }) {
  return (
    <section className="ds-sidebar__section">
      <h2 className="ds-sidebar__heading">Workspaces</h2>
      {groupWorkspaces(workspaces).map((group) => (
        <div key={group.category} className="ds-sidebar__group">
          <h3 className="ds-sidebar__category">{group.category}</h3>
          <ul className="ds-sidebar__list">
            {group.workspaces.map((workspace) => (
              <li key={workspace.href}>
                <a
                  href={workspace.href}
                  className="ds-sidebar__row ds-sidebar__workspace"
                  aria-current={workspace.current ? 'page' : undefined}
                >
                  <span
                    className="ds-sidebar__dot"
                    data-status={workspace.status}
                    aria-hidden="true"
                  />
                  <span className="ds-sidebar__label">{workspace.name}</span>
                  <span className="ds-visually-hidden">
                    , {STATUS_TEXT[workspace.status]}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
