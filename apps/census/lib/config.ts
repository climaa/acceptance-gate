/**
 * What `pnpm census:measure` has to be told about a repository before it can
 * measure it: which workspace builds Storybook, which paths hold code no package
 * owns, which apps are deployed and which app each acceptance feature visits.
 *
 * This repository's answers are constants in `features.ts` and `assemble.ts`,
 * gathered here as `DEFAULT_CONFIG`. Another checkout states its own in a
 * `census.config.json` at its root, and `census:measure --root <checkout>` reads
 * that file instead: the same measuring code, a different repository.
 *
 * Nothing here reads a disk. The measure step reads the file and tells
 * `configProblems` what the checkout holds; an invalid file stops the run before
 * a single suite starts, with every problem named.
 */
import { z } from 'zod';

import { PSEUDO_WORKSPACES } from './assemble.ts';
import { FEATURE_MAP, type FeatureMap } from './features.ts';

/** The file a measured checkout keeps at its root. */
export const CHECKOUT_CONFIG = 'census.config.json';

const text = z.string().min(1);

const configSchema = z.strictObject({
  /** `owner/name` on GitHub, as the measurement names it. */
  repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/, 'expected owner/name'),
  /** The workspace whose build writes `storybook-static/index.json`. */
  storybook: text,
  /** The vitest config the pseudo-workspaces run under, or `null` if there is none. */
  sharedVitestConfig: text.nullable(),
  /** Code measured by path rather than as a package: `{ name: 'scripts/', path: 'scripts' }`. */
  pseudoWorkspaces: z.array(z.strictObject({ name: text, path: text })),
  /** Deployed app → the workspace it is built from. */
  apps: z.record(text, text),
  /** Feature name (the file's, without `.feature`) → the app it visits. */
  features: z.record(text, text),
  /** The features under `features/local/`, which never make an app visited. */
  localFeatures: z.array(text),
});

export type CensusConfig = z.infer<typeof configSchema> & FeatureMap;

export const DEFAULT_CONFIG: CensusConfig = {
  repo: 'climaa/acceptance-gate',
  storybook: FEATURE_MAP.apps.storybook ?? 'apps/storybook',
  sharedVitestConfig: 'vitest.sandcastle.config.mts',
  pseudoWorkspaces: PSEUDO_WORKSPACES.map((ws) => ({ ...ws })),
  apps: { ...FEATURE_MAP.apps },
  features: { ...FEATURE_MAP.features },
  localFeatures: [...FEATURE_MAP.localFeatures],
};

/** What the measure step found in the checkout, for the rules a shape cannot check. */
export interface Checkout {
  /** Whether a repo-relative file or directory exists. */
  has(path: string): boolean;
  /** The name of every `.feature` under `apps/e2e/features/`, without the extension. */
  featureNames: readonly string[];
}

function pathProblems(config: CensusConfig, checkout: Checkout): string[] {
  const workspace = (where: string, path: string) =>
    checkout.has(`${path}/package.json`) ? [] : [`${where}: ${path} is not a workspace`];
  return [
    ...workspace('storybook', config.storybook),
    ...Object.entries(config.apps).flatMap(([app, path]) =>
      workspace(`apps.${app}`, path),
    ),
    ...config.pseudoWorkspaces.flatMap((ws, index) =>
      checkout.has(ws.path)
        ? []
        : [`pseudoWorkspaces.${index}.path: ${ws.path} does not exist`],
    ),
    ...(config.sharedVitestConfig === null || checkout.has(config.sharedVitestConfig)
      ? []
      : [`sharedVitestConfig: ${config.sharedVitestConfig} does not exist`]),
  ];
}

function featureProblems(config: CensusConfig, checkout: Checkout): string[] {
  const written = new Set(checkout.featureNames);
  return [
    ...Object.entries(config.features).flatMap(([feature, app]) => [
      ...(Object.hasOwn(config.apps, app)
        ? []
        : [`features.${feature}: ${app} is not in apps`]),
      ...(written.has(feature)
        ? []
        : [`features.${feature}: no ${feature}.feature under apps/e2e/features`]),
    ]),
    ...checkout.featureNames
      .filter((name) => !Object.hasOwn(config.features, name))
      .map((name) => `features: ${name}.feature is not mapped to an app`),
    ...config.localFeatures.flatMap((name, index) =>
      Object.hasOwn(config.features, name)
        ? []
        : [`localFeatures.${index}: ${name} is not in features`],
    ),
  ];
}

/**
 * A checkout's parsed `census.config.json`, or every problem with it as
 * `<path>: <what is wrong>`. Shape first; only a file of the right shape goes on
 * to the rules that compare it with the checkout.
 */
export function readConfig(
  value: unknown,
  checkout: Checkout,
): { config: CensusConfig } | { problems: string[] } {
  const parsed = parseConfig(value);
  if ('problems' in parsed) return parsed;
  const problems = [
    ...pathProblems(parsed.config, checkout),
    ...featureProblems(parsed.config, checkout),
  ];
  return problems.length > 0 ? { problems } : parsed;
}

/**
 * The shape check alone, for a reader with no checkout to compare against: the
 * app, reading the copy `census:measure --root` leaves beside a measurement.
 */
export function parseConfig(
  value: unknown,
): { config: CensusConfig } | { problems: string[] } {
  const parsed = configSchema.safeParse(value);
  if (parsed.success) return { config: parsed.data };
  return {
    problems: parsed.error.issues.map(
      (issue) => `${issue.path.join('.') || CHECKOUT_CONFIG}: ${issue.message}`,
    ),
  };
}
