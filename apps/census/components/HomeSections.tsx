import {
  Badge,
  CodeBlock,
  CoverageList,
  GapPills,
  Hotspots,
  Icicle,
  PenaltyBars,
  ProfileBar,
  SparkStat,
  StatePies,
  StoriesList,
  Table,
  TestPyramid,
} from '@gate/ui';
import type { HomeFilter } from '@/lib/filter.ts';
import { WINDOW, type NamedCount, type Overview } from '@/lib/overview.ts';
import { CopyButton } from './CopyButton';
import { SectionCard } from './SectionCard';

type Of<K extends keyof Overview> = { data: Overview[K] };

export function SummaryCard({ data }: Of<'summary'>) {
  return (
    <SectionCard title="Summary" description={data.caption}>
      <ul className="census-highlights">
        {data.highlights.map((h) => (
          <li key={h.text} className="census-highlight">
            {h.tone === 'alert' ? (
              <Badge tone="danger">alert</Badge>
            ) : (
              <span aria-hidden="true" className={`census-key census-key--${h.tone}`} />
            )}
            <span>{h.text}</span>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

/** The four dimensions' meters; a dimension filter lights its row and dims the rest. */
export function CoverageCard({ data, filter }: Of<'coverage'> & { filter: HomeFilter }) {
  return (
    <div className="census-coverage" data-lit={filter.dimension ?? undefined}>
      <CoverageList
        title="Repository coverage"
        description="How much of the repository each dimension covers. Gaps are what is left."
        rows={data}
        window={WINDOW}
      />
    </div>
  );
}

const METRIC_COLUMNS = [
  { header: 'Dimension' },
  { header: 'Metric' },
  { header: 'Value', numeric: true },
  { header: 'Unit' },
  { header: 'Change', numeric: true },
  { header: 'Period' },
] as const;

export function MetricsCard({ data }: Of<'metrics'>) {
  return (
    <SectionCard
      title="Metrics"
      description="The same figures as a table: what the bars and pies above show, readable without them."
    >
      <Table
        className="census-metrics"
        label="Metrics"
        columns={METRIC_COLUMNS}
        rows={data.map((r) => ({
          key: r.key,
          cells: [r.dimension, r.metric, r.value, r.unit, r.change, r.period],
        }))}
      />
    </SectionCard>
  );
}

export function PyramidCard({ data }: Of<'pyramid'>) {
  return (
    <SectionCard
      className="census-pyramid"
      title="Testing pyramid"
      description="Tests per level, one unit each: cases, screenshots, scenarios."
    >
      <TestPyramid bands={data.bands} />
      {data.caption !== undefined && <p className="census-caption">{data.caption}</p>}
    </SectionCard>
  );
}

export function GapPillsCard({ data }: Of<'gapPills'>) {
  return (
    <SectionCard
      className="census-gap-pills"
      title="Gaps by dimension"
      description={data.caption}
    >
      <GapPills gaps={data.gaps} />
    </SectionCard>
  );
}

export function StoriesCard({ data }: Of<'stories'>) {
  return (
    <SectionCard
      title="Stories"
      description="Components a story renders. One without a story has no tile, no baseline and no visual test."
    >
      <StoriesList workspaces={data.workspaces} />
    </SectionCard>
  );
}

export function StatesCard({ data }: Of<'states'>) {
  return (
    <SectionCard title="Screen states" description={data.caption}>
      <StatePies states={data.pies} />
      {data.withoutLoading.length > 0 && (
        <div className="census-routes">
          <h3 className="census-subtitle-caps">{data.heading}</h3>
          <ul className="census-routes__list">
            {data.withoutLoading.map((app) => (
              <li key={app.app}>
                {app.app}: {app.routes.join(', ')}
              </li>
            ))}
          </ul>
        </div>
      )}
    </SectionCard>
  );
}

export function Score({
  score,
  grade,
  source,
}: {
  score: number;
  grade: string;
  source: string;
}) {
  return (
    <div className="census-score">
      <p className="census-subtitle-caps">Score</p>
      <p className="census-score__value">
        {score} <span className="census-score__grade">{grade}</span>
      </p>
      <p className="census-caption">{source}</p>
    </div>
  );
}

export function HealthCard({ data }: Of<'health'>) {
  return (
    <SectionCard
      title="Code health"
      description="fallow's score for the repository, what it loses points on, and the shape of its functions."
    >
      <div className="census-split">
        <Score score={data.score} grade={data.grade} source={data.source} />
        <PenaltyBars title="What costs points" penalties={data.penalties} />
      </div>
      <ProfileBar
        title="Function size"
        unit="lines per function"
        shares={data.unitSize}
      />
      <ProfileBar
        title="Function parameters"
        unit="arguments per function"
        shares={data.interfacing}
      />
      <ul className="census-sparks">
        {data.sparks.map((s) => (
          <li key={s.label}>
            <SparkStat
              label={s.label}
              value={s.value}
              delta={s.delta}
              better={s.better}
              window="in 30 days"
              series={s.series}
            />
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

function CountRows({ rows }: { rows: readonly NamedCount[] }) {
  return (
    <ul className="census-counts">
      {rows.map((row) => (
        <li key={row.name} className="census-count">
          <span className="census-count__name">
            <strong>{row.name}</strong>
            <span>{row.detail}</span>
          </span>
          <span className="census-count__value">{row.value}</span>
        </li>
      ))}
    </ul>
  );
}

export function DeadCodeCard({ data }: Of<'dead'>) {
  return (
    <SectionCard
      title="Dead code"
      description="What nothing imports. Each one is a removal or an issue."
    >
      <CountRows rows={data} />
    </SectionCard>
  );
}

export function StylingCard({ data }: Of<'styling'>) {
  if (data === null) return null;
  return (
    <SectionCard
      title="Styling health"
      description="fallow --css: how well the CSS keeps to the design tokens."
    >
      <Score score={data.score} grade={data.grade} source={data.source} />
      <CountRows rows={data.findings} />
    </SectionCard>
  );
}

export function HotspotsCard({ data }: Of<'hotspots'>) {
  return (
    <SectionCard
      title="Hotspots"
      description="Files that are both complex and often changed."
    >
      <Hotspots
        hotspots={data.dots}
        xLabel="commits in 6 months →"
        yLabel="complexity density ↑"
        quadrantLabel="refactor here"
        label="Hotspots"
      />
      <h3 className="census-subtitle-caps">Complexity by folder</h3>
      <Icicle root={data.complexity} label="Complexity by folder" />
      <div className="census-targets__head">
        <h3 className="census-subtitle-caps">Refactor targets · {data.targetCount}</h3>
        <span className="census-caption">priority</span>
      </div>
      <ul className="census-targets">
        {data.targets.map((t) => (
          <li key={t.path} className="census-target">
            <a href={t.href}>{t.path}</a>
            <Badge tone="dashed">{t.effort}</Badge>
            <span className="census-count__value">{t.priority}</span>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

export function CodeCoverageCard({ data }: Of<'codeCoverage'>) {
  return (
    <SectionCard
      title="Code coverage by workspace"
      description="Repository, category, workspace: each block as wide as its lines, coloured by its coverage against its floor."
    >
      <ul className="census-legend">
        <li>
          <Badge tone="success">at or over the floor</Badge>
        </li>
        <li>
          <Badge tone="warning">under the floor</Badge>
        </li>
        <li>
          <Badge tone="danger">unmeasured</Badge>
        </li>
      </ul>
      <Icicle root={data} label="Code coverage by workspace" />
    </SectionCard>
  );
}

export function NotesCard({
  notes,
  rerun,
  exports,
}: Pick<Overview, 'notes' | 'rerun' | 'exports'>) {
  return (
    <SectionCard
      title="Notes and caveats"
      description="What this page cannot tell you yet."
    >
      <ul className="census-notes">
        {notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
      <h3 className="census-subtitle-caps">Rerun inputs</h3>
      <CodeBlock>{rerun}</CodeBlock>
      <div className="census-exports">
        <a className="ds-btn ds-btn--primary ds-btn--sm" href={exports.jsonHref}>
          Download JSON
        </a>
        <CopyButton
          className="ds-btn ds-btn--secondary ds-btn--sm"
          text={exports.markdown}
        >
          Copy Markdown
        </CopyButton>
      </div>
    </SectionCard>
  );
}
