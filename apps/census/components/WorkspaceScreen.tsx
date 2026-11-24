import { Badge, type BadgeTone, EmptyState, Icicle, StatTile, Table } from '@gate/ui';
import type { IcicleTone } from '@gate/ui';
import type { InventoryRow, WorkspaceView } from '@/lib/workspace.ts';
import { CopyButton } from './CopyButton';
import { FileViews } from './FileViews';
import { PenalisedScore } from './HomeSections';
import { Legend } from './Legend';
import { RefactorTargets } from './RefactorTargets';
import { SectionCard } from './SectionCard';

type Of<K extends keyof WorkspaceView> = { data: WorkspaceView[K] };

const TONE: Partial<Record<IcicleTone, BadgeTone>> = {
  success: 'success',
  warning: 'warning',
  danger: 'danger',
};

function Intro({ view }: { view: WorkspaceView }) {
  return (
    <div className="census-intro">
      <h1 className="census-title census-workspace__title">
        {view.name} <Badge>{view.category}</Badge>
      </h1>
      <p className="census-workspace__path">{view.path}</p>
      <p className="census-tools">{view.tools}</p>
    </div>
  );
}

function Tiles({ data }: Of<'tiles'>) {
  return (
    <ul className="census-tiles" aria-label="Dimensions">
      {data.map((tile) => (
        <li key={tile.label}>
          <StatTile
            label={tile.label}
            value={tile.value}
            detail={tile.detail}
            state={tile.state}
            {...(tile.meter === undefined ? {} : { meter: tile.meter })}
          />
        </li>
      ))}
    </ul>
  );
}

function CodeCard({ data }: Of<'code'>) {
  if (data.state !== 'measured') {
    return (
      <SectionCard title="Code">
        <EmptyState
          className="census-empty"
          message={
            <>
              <strong className="census-empty__title">{data.title}</strong>
              <span>{data.reason}</span>
            </>
          }
        />
      </SectionCard>
    );
  }
  return (
    <SectionCard
      title={`Code · ${data.files} files`}
      description="One block per file, as wide as its lines, coloured by coverage."
    >
      <Legend items={data.legend} />
      <Icicle root={data.root} label="Coverage by file" />
    </SectionCard>
  );
}

function HealthCard({ data, files }: Of<'health'> & { files: number }) {
  if (data === null) return null;
  return (
    <SectionCard title={data.title} description={data.caption}>
      <PenalisedScore data={data} />
      {data.targets.length > 0 && (
        <RefactorTargets targets={data.targets} count={data.targets.length} />
      )}
      {data.views.length > 0 && (
        <FileViews views={data.views} files={files} note={data.note} />
      )}
    </SectionCard>
  );
}

function Heading({
  id,
  title,
  count,
  tone,
}: {
  id: string;
  title: string;
  count: number;
  tone?: BadgeTone;
}) {
  return (
    <h2 id={id} className="census-section__title">
      {title} <Badge {...(tone === undefined ? {} : { tone })}>{count}</Badge>
    </h2>
  );
}

/* The tile's figure columns: 136px for Lines and Covered, 120px for the pill. */
const FIGURE = 'calc(var(--space-16) * 2 + var(--space-2))';
const PILL = 'calc(var(--space-16) + var(--space-12) + var(--space-2))';

const FILE_COLUMNS = [
  { header: 'File' },
  { header: 'Lines', numeric: true, width: FIGURE },
  { header: 'Covered', numeric: true, width: FIGURE },
  { header: 'Coverage', width: PILL },
] as const;

function FilesTable({ data }: Of<'files'>) {
  if (data === null) return null;
  return (
    <section className="census-section" aria-labelledby="census-files-title">
      <Heading id="census-files-title" title="Files, largest first" count={data.total} />
      <Table
        label="Files, largest first"
        className="census-files"
        columns={FILE_COLUMNS}
        rows={data.rows.map((row) => ({
          key: row.path,
          cells: [
            <a key="path" className="census-file" href={row.href}>
              {row.path}
            </a>,
            row.lines,
            row.covered,
            <Badge key="pct" tone={TONE[row.tone] ?? 'dashed'}>
              {row.pct}
            </Badge>,
          ],
        }))}
      />
      {data.more !== null && <p className="census-more">{data.more}</p>}
    </section>
  );
}

function Gaps({ data }: Of<'gaps'>) {
  return (
    <section className="census-gaps" aria-labelledby="census-gaps-title">
      <h2 id="census-gaps-title" className="census-gaps__title">
        Gaps <Badge tone={data.count === 0 ? 'success' : 'danger'}>{data.count}</Badge>
      </h2>
      {data.count === 0 && (
        <p className="census-more">
          No gaps. Every layer that applies to this workspace is measured and complete.
        </p>
      )}
      {data.groups.map((group) => (
        <div key={group.dimension} className="census-gaps__group">
          <h3 className="census-gaps__dimension">
            {group.label} <span>{group.rows.length}</span>
          </h3>
          <ul className="census-gaps__rows">
            {group.rows.map((gap) => (
              <li key={gap.id} id={gap.anchor} className="census-gap census-gap--own">
                <CopyButton
                  className="census-gap__title"
                  text={gap.title}
                  label={`Copy "${gap.title}" as an issue title`}
                >
                  {gap.title}
                </CopyButton>
                <Badge className="census-gap__kind">{gap.kind}</Badge>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function Mark({ on, what }: { on: boolean; what: string }) {
  return (
    <span className={`census-mark census-mark--${on ? 'yes' : 'no'}`}>
      <span aria-hidden="true">{on ? '✓' : '✕'}</span>
      <span className="ds-visually-hidden">{on ? `has a ${what}` : `no ${what}`}</span>
    </span>
  );
}

/* The tile's inventory: 136px for the tier, 88px for each mark, 240px for the links. */
const MARK = 'calc(var(--space-16) + var(--space-4) + var(--space-2))';

const INVENTORY_COLUMNS = [
  { header: 'Visual' },
  { header: 'Tier', width: FIGURE },
  { header: 'Story', width: MARK },
  { header: 'Tile', width: MARK },
  { header: 'Baseline', width: MARK },
  { header: 'Open', width: 'calc(var(--space-16) * 3 + var(--space-12))' },
] as const;

function Links({ row }: { row: InventoryRow }) {
  return (
    <span className="census-open">
      {row.links.map((link) => (
        <a key={link.label} href={link.href} aria-label={`${row.name}: ${link.label}`}>
          {link.label}
        </a>
      ))}
    </span>
  );
}

function Inventory({ data }: Of<'inventory'>) {
  if (data === null) return null;
  return (
    <section className="census-section" aria-labelledby="census-inventory-title">
      <Heading id="census-inventory-title" title={data.heading} count={data.count} />
      <Table
        label={data.heading}
        className="census-inventory"
        columns={INVENTORY_COLUMNS}
        rows={data.rows.map((row) => ({
          key: row.key,
          cells: [
            <strong key="name">{row.name}</strong>,
            <Badge key="tier">{row.tier}</Badge>,
            <Mark key="story" on={row.story} what="story" />,
            <Mark key="tile" on={row.tiled} what="tile" />,
            <Mark key="baseline" on={row.baselined} what="baseline" />,
            <Links key="open" row={row} />,
          ],
        }))}
      />
      {data.more !== null && <p className="census-more">{data.more}</p>}
    </section>
  );
}

/** `/[workspace]`: one workspace, detailed, in the board's order. */
export function WorkspaceScreen({ view }: { view: WorkspaceView }) {
  const files = view.code.state === 'measured' ? view.code.files : 0;
  return (
    <main className="census-main census-workspace">
      <Intro view={view} />
      <Tiles data={view.tiles} />
      <CodeCard data={view.code} />
      <HealthCard data={view.health} files={files} />
      <FilesTable data={view.files} />
      <Gaps data={view.gaps} />
      <Inventory data={view.inventory} />
    </main>
  );
}
