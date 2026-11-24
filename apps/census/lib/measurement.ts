/**
 * The measurement and history files, as data. `pnpm census:measure` writes both,
 * the pages read both, and neither is ever typed by hand, so this module is the
 * one place their shape is stated. A breaking change bumps `schema`.
 *
 * Shape only. The rules that relate one field to another (a percentage that has
 * to recompute, a gap that has to name a workspace that exists) live in
 * `validate.ts`, which runs these schemas first.
 *
 * Imports between `lib/` modules carry their `.ts` extension: the measure step is
 * a plain `node` script and loads `lib/` through Node's type stripping, with no
 * build. Nothing here may use syntax type stripping cannot erase.
 */
import { z } from 'zod';

/** The four things a measurement covers (CONTEXT.md, _dimension_). */
export const DIMENSIONS = ['code', 'visual', 'acceptance', 'health'] as const;
export type Dimension = (typeof DIMENSIONS)[number];

/** The three groups a workspace belongs to (CONTEXT.md, _category_). */
export const CATEGORIES = ['packages', 'apps', 'scripts'] as const;
export type Category = (typeof CATEGORIES)[number];

export const GAP_KINDS = [
  'unmeasured-workspace',
  'uncovered-file',
  'component-incomplete',
  'story-missing',
  'route-state-missing',
  'app-unvisited',
] as const;
export type GapKind = (typeof GAP_KINDS)[number];

const count = z.number().int().nonnegative();
/** 0–100 with at most one decimal: what the pages print, so nothing rounds twice. */
const percent = z
  .number()
  .min(0)
  .max(100)
  .refine((n) => Number.isInteger(n * 10), 'at most one decimal');
const commit = z.string().regex(/^[0-9a-f]{40}$/, 'a 40-hex commit');
const isoDate = z.iso.datetime();
/** Repo- or workspace-relative POSIX: never absolute, never a backslash, never `..`. */
const relativePath = z
  .string()
  .min(1)
  .refine(
    (p) => !p.startsWith('/') && !p.includes('\\') && !p.split('/').includes('..'),
    'a relative POSIX path',
  );

const lineCount = z.object({ covered: count, total: count, pct: percent });
const stateCount = z.object({ own: count, inherited: count, none: count });

const fileValue = z.object({
  path: relativePath,
  group: z.string().min(1).optional(),
  lines: lineCount,
  maintainability: z.number().optional(),
  crap: z.number().nonnegative().optional(),
});

const reasoned = <D extends Dimension>(dimension: D) => [
  z.object({
    dimension: z.literal(dimension),
    state: z.literal('unmeasured'),
    reason: z.string().min(1),
  }),
  z.object({
    dimension: z.literal(dimension),
    state: z.literal('not-applicable'),
    reason: z.string().min(1),
  }),
];

/**
 * One thing the Visual dimension judges, by name: a `packages/ui` component or an
 * app's screen story. `story` is the one its links open; `board` the design board
 * its tile is on, when it has one. Optional on the value, since a measurement
 * written before the list was recorded has none.
 */
const inventoryItem = z.object({
  name: z.string().min(1),
  tier: z.string().min(1),
  story: z.string().min(1).optional(),
  tiled: z.boolean(),
  board: z.string().min(1).optional(),
  baselined: z.boolean(),
});

const codeValue = z.discriminatedUnion('state', [
  z.object({
    dimension: z.literal('code'),
    state: z.literal('measured'),
    lines: lineCount,
    floor: percent.optional(),
    staticReachPct: percent,
    files: z.array(fileValue),
  }),
  ...reasoned('code'),
]);

const visualValue = z.discriminatedUnion('state', [
  z.object({
    dimension: z.literal('visual'),
    state: z.literal('measured'),
    components: z.object({
      total: count,
      storied: count,
      tiled: count,
      baselined: count,
    }),
    screens: z.object({ stories: count, tiled: count, baselined: count }).optional(),
    routes: z
      .object({
        total: count,
        loading: stateCount,
        error: stateCount,
        notFound: stateCount,
      })
      .optional(),
    inventory: z.array(inventoryItem).optional(),
  }),
  ...reasoned('visual'),
]);

const acceptanceValue = z.discriminatedUnion('state', [
  z.object({
    dimension: z.literal('acceptance'),
    state: z.literal('measured'),
    scenarios: count,
    features: z.array(z.string().min(1)),
  }),
  ...reasoned('acceptance'),
]);

const healthValue = z.discriminatedUnion('state', [
  z.object({
    dimension: z.literal('health'),
    state: z.literal('measured'),
    score: percent,
    grade: z.enum(['A', 'B', 'C', 'D', 'F']),
    overCeiling: count,
    deadFiles: count,
    deadExports: count,
    refactorTargets: count,
  }),
  ...reasoned('health'),
]);

const workspace = z.object({
  name: z.string().min(1),
  path: relativePath,
  category: z.enum(CATEGORIES),
  // Every key, always: a missing dimension is a fault, never "not applicable".
  dimensions: z.object({
    code: codeValue,
    visual: visualValue,
    acceptance: acceptanceValue,
    health: healthValue,
  }),
});

const repositoryHealth = z.object({
  score: percent,
  grade: z.string().min(1),
  penalties: z.array(
    z.object({ name: z.string().min(1), points: z.number().nonnegative() }),
  ),
  dead: z.object({
    files: count,
    exports: count,
    types: count,
    unlistedDeps: count,
    cycles: count,
    // Optional: measurements written before these were recorded have none.
    totalFiles: count.optional(),
    totalExports: count.optional(),
    boundaries: z.boolean().optional(),
  }),
  duplication: z.object({
    semanticPct: percent,
    mildPct: percent,
    lines: count,
    groups: count,
  }),
  styling: z
    .object({
      score: percent,
      grade: z.string().min(1),
      tokenDrift: count,
      duplicateBlocks: count,
      complexSelectors: count,
      important: count,
    })
    .optional(),
  hotspots: z.array(
    z.object({ path: relativePath, churn: count, complexity: z.number().nonnegative() }),
  ),
  refactorTargets: z.array(
    z.object({ path: relativePath, priority: z.number(), effort: z.string().min(1) }),
  ),
  profiles: z.object({
    unitSize: z.array(percent).length(4),
    interfacing: z.array(percent).length(4),
  }),
  crapOver30: count,
  crapSource: z.enum(['estimated', 'measured']),
});

const gap = z.object({
  id: z.string().min(1),
  // A Health value is shown, never a gap.
  dimension: z.enum(['code', 'visual', 'acceptance']),
  workspace: z.string().min(1),
  kind: z.enum(GAP_KINDS),
  subject: z.string().min(1),
  title: z
    .string()
    .min(1)
    .refine((t) => !t.includes('\n'), 'one line'),
});

export const measurementSchema = z.object({
  schema: z.literal(1),
  repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/, 'owner/name'),
  commit,
  measuredAt: isoDate,
  tools: z.record(z.string(), z.string()),
  pyramid: z.object({ unit: count, visual: count, acceptance: count }),
  health: repositoryHealth,
  workspaces: z.array(workspace).min(1),
  gaps: z.array(gap),
});

const historyPoint = z.object({
  commit,
  measuredAt: isoDate,
  dimensions: z.object({
    code: percent.nullable(),
    visual: percent.nullable(),
    acceptance: percent.nullable(),
    health: percent.nullable(),
  }),
  fallow: z.object({
    score: percent,
    grade: z.string().min(1),
    dupPct: percent,
    crapOver: count,
    overCeiling: count,
    // Optional: points written before the count was recorded have none.
    deadFiles: count.optional(),
  }),
});

export const historySchema = z.object({
  schema: z.literal(1),
  points: z.array(historyPoint),
});

export type Measurement = z.infer<typeof measurementSchema>;
export type Workspace = z.infer<typeof workspace>;
export type DimensionValue = Workspace['dimensions'][Dimension];
export type FileValue = z.infer<typeof fileValue>;
export type InventoryItem = z.infer<typeof inventoryItem>;
export type RepositoryHealth = z.infer<typeof repositoryHealth>;
export type Gap = z.infer<typeof gap>;
export type History = z.infer<typeof historySchema>;
export type HistoryPoint = z.infer<typeof historyPoint>;
