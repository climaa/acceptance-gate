import { Meter } from '../../atoms/Meter/Meter';

export interface StoriesWorkspace {
  /** The workspace's package name: `@gate/ui`. */
  name: string;
  /** Every component the workspace exports. */
  total: number;
  /** The components without a story, by name. */
  missing: string[];
}

export interface StoriesListProps {
  workspaces: StoriesWorkspace[];
  className?: string;
}

/** How many missing components a row names before it only counts the rest. */
const NAMED = 5;

export function storiesTotals(workspaces: StoriesWorkspace[]) {
  return workspaces.reduce(
    (sum, ws) => ({
      missing: sum.missing + ws.missing.length,
      total: sum.total + ws.total,
    }),
    { missing: 0, total: 0 },
  );
}

/** 0–100: the share of the workspace's components that have a story. */
export function storyShare({ total, missing }: StoriesWorkspace): number {
  return total === 0 ? 100 : ((total - missing.length) / total) * 100;
}

export function listMissing(names: string[]): string {
  const named = names.slice(0, NAMED).join(', ');
  const rest = names.length - NAMED;
  return rest > 0 ? `${named} +${rest}` : named;
}

/** The components without a story, one Meter row per workspace. */
export function StoriesList({ workspaces, className }: StoriesListProps) {
  const totals = storiesTotals(workspaces);

  return (
    <div className={['ds-stories-list', className].filter(Boolean).join(' ')}>
      <p className="ds-stories-list__headline">
        <span className="ds-stories-list__count">{totals.missing}</span>
        <span>{`of ${totals.total} components have no story`}</span>
      </p>
      <ul className="ds-stories-list__rows">
        {workspaces.map((ws) => (
          <li key={ws.name} className="ds-stories-list__row">
            <div className="ds-stories-list__head">
              <div className="ds-stories-list__name">
                <p className="ds-stories-list__workspace">{ws.name}</p>
                <p className="ds-stories-list__detail">
                  {`${ws.total - ws.missing.length} of ${ws.total} with a story`}
                </p>
              </div>
              <Meter
                label={`${ws.name}: components with a story`}
                value={storyShare(ws)}
                hue="chart-2"
                className="ds-stories-list__meter"
              />
              <p className="ds-stories-list__figure">{`${ws.missing.length} missing`}</p>
            </div>
            {ws.missing.length > 0 && (
              <p className="ds-stories-list__missing">{listMissing(ws.missing)}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
