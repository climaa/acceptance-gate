import { Badge } from '@gate/ui';
import { filterChips, filterGaps, type GapRow, type HomeFilter } from '@/lib/filter.ts';
import { DIMENSIONS } from '@/lib/measurement.ts';
import { DIMENSION_LABEL } from '@/lib/trend.ts';
import { CopyButton } from './CopyButton';

export interface GapListProps {
  gaps: readonly GapRow[];
  filter: HomeFilter;
}

/** Every open gap, grouped by dimension; the filter narrows it and shows as removable chips. */
export function GapList({ gaps, filter }: GapListProps) {
  const shown = filterGaps(gaps, filter);
  const chips = filterChips(filter);
  const groups = DIMENSIONS.map((d) => ({
    d,
    rows: shown.filter((g) => g.dimension === d),
  })).filter((group) => group.rows.length > 0);

  return (
    <section className="census-gaps" aria-labelledby="census-gaps-title">
      <h2 id="census-gaps-title" className="census-gaps__title">
        Gaps <Badge tone="danger">{shown.length}</Badge>
      </h2>
      {chips.length > 0 && (
        <ul className="census-gaps__chips" aria-label="Filters">
          {chips.map((chip) => (
            <li key={chip.label}>
              <a
                className="census-chip"
                href={chip.href}
                aria-label={`Remove ${chip.label}`}
              >
                {chip.label} <span aria-hidden="true">×</span>
              </a>
            </li>
          ))}
        </ul>
      )}
      {groups.map(({ d, rows }) => (
        <div key={d} className="census-gaps__group">
          <h3 className="census-gaps__dimension">
            {DIMENSION_LABEL[d]} <span>{rows.length}</span>
          </h3>
          <ul className="census-gaps__rows">
            {rows.map((gap) => (
              <li key={gap.id} id={gap.anchor} className="census-gap">
                <CopyButton
                  className="census-gap__title"
                  text={gap.title}
                  label={`Copy "${gap.title}" as an issue title`}
                >
                  {gap.title}
                </CopyButton>
                <a className="census-gap__workspace" href={gap.workspaceHref}>
                  {gap.workspace}
                </a>
                <Badge className="census-gap__kind">{gap.kind}</Badge>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
