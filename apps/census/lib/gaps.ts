/**
 * The gap rules: what each dimension expected and did not find (CONTEXT.md, _gap_).
 *
 * Pure functions over what the measure step collected. A gap is derived, never
 * typed by hand, and its id is stable across measurements while the thing stays
 * missing, so an issue body can cite it. Six kinds and no more: a seventh is a
 * decision, not a code change.
 *
 * Deliberately never a gap: a `not-applicable` dimension, any Health value (shown,
 * never filed), a file under its floor but above zero (the floor already gates it),
 * and a file with no covered lines that its tests run as a child process
 * (`testedAsProcess`): it has a test, which vitest's own process cannot measure.
 */
import { FEATURE_MAP, type FeatureMap } from './features.ts';
import type { Gap, GapKind, Workspace } from './measurement.ts';

/** What a component or screen story can lack. */
export type StoryPart = 'story' | 'tile' | 'baseline';

/** Where a route's loading, error or not-found boundary comes from. */
export type BoundarySource = 'own' | 'inherited' | 'none';

/** The Visual subjects of one workspace that the dimension's counts cannot carry. */
export interface VisualSubjects {
  /** Each component or screen story, with the parts it lacks (empty when complete). */
  incomplete: readonly { storyId: string; missing: readonly StoryPart[] }[];
  /** Components no story renders, directly or through other components, by name. */
  unstoried: readonly string[];
  /** Each App Router route and where its three boundaries come from. */
  routes: readonly {
    route: string;
    loading: BoundarySource;
    error: BoundarySource;
    notFound: BoundarySource;
  }[];
}

/** `<kind>:<workspace path>[:<subject>]`, the subject left out when it is the workspace. */
export function gapId(kind: GapKind, workspacePath: string, subject?: string): string {
  return subject === undefined
    ? `${kind}:${workspacePath}`
    : `${kind}:${workspacePath}:${subject}`;
}

type Draft = Omit<Gap, 'id' | 'workspace'> & { idSubject?: string };

function codeGaps(ws: Workspace): Draft[] {
  const code = ws.dimensions.code;
  if (code.state === 'unmeasured') {
    return [
      {
        dimension: 'code',
        kind: 'unmeasured-workspace',
        subject: ws.path,
        title: `${ws.name}: measure coverage`,
      },
    ];
  }
  if (code.state !== 'measured') return [];
  return code.files
    .filter(
      (file) => file.lines.total > 0 && file.lines.covered === 0 && !file.testedAsProcess,
    )
    .map((file) => ({
      dimension: 'code',
      kind: 'uncovered-file',
      subject: file.path,
      idSubject: file.path,
      title: `${ws.name}: ${file.path} has no test`,
    }));
}

const STATES = [
  ['loading', 'loading'],
  ['error', 'error'],
  ['notFound', 'not-found'],
] as const;

function visualGaps(ws: Workspace, subjects: VisualSubjects): Draft[] {
  const incomplete: Draft[] = subjects.incomplete
    .filter((story) => story.missing.length > 0)
    .map((story) => ({
      dimension: 'visual',
      kind: 'component-incomplete',
      subject: story.storyId,
      idSubject: story.storyId,
      title: `${story.storyId}: ${story.missing.map((part) => `no ${part}`).join(', ')}`,
    }));
  const unstoried: Draft[] = subjects.unstoried.map((component) => ({
    dimension: 'visual',
    kind: 'story-missing',
    subject: component,
    idSubject: component,
    title: `${ws.name}: ${component} has no story`,
  }));
  const routes: Draft[] = subjects.routes.flatMap((route) =>
    STATES.filter(([key]) => route[key] === 'none').map(([, state]) => ({
      dimension: 'visual' as const,
      kind: 'route-state-missing' as const,
      subject: `${route.route}:${state}`,
      idSubject: `${route.route}:${state}`,
      title: `${ws.name}: ${route.route} has no ${state} state`,
    })),
  );
  return [...incomplete, ...unstoried, ...routes];
}

function acceptanceGaps(ws: Workspace, deployed: ReadonlySet<string>): Draft[] {
  const acceptance = ws.dimensions.acceptance;
  if (!deployed.has(ws.path)) return [];
  if (acceptance.state !== 'measured' || acceptance.scenarios > 0) return [];
  return [
    {
      dimension: 'acceptance',
      kind: 'app-unvisited',
      subject: ws.path,
      title: `${ws.name}: no acceptance scenario`,
    },
  ];
}

const NO_SUBJECTS: VisualSubjects = { incomplete: [], unstoried: [], routes: [] };

/**
 * Every gap in the given workspaces, in workspace order and, within one, Code →
 * Visual → Acceptance. `subjects` is keyed by workspace path; a workspace missing
 * from it has no Visual subjects to judge. `map` says which workspaces are
 * deployed apps: this repository's unless another's is given.
 */
export function deriveGaps(
  workspaces: readonly Workspace[],
  subjects: Readonly<Record<string, VisualSubjects>>,
  map: FeatureMap = FEATURE_MAP,
): Gap[] {
  const deployed = new Set(Object.values(map.apps));
  return workspaces.flatMap((ws) =>
    [
      ...codeGaps(ws),
      ...visualGaps(ws, subjects[ws.path] ?? NO_SUBJECTS),
      ...acceptanceGaps(ws, deployed),
    ].map(({ idSubject, ...draft }) => ({
      id: gapId(draft.kind, ws.path, idSubject),
      workspace: ws.name,
      ...draft,
    })),
  );
}
