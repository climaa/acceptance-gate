import { describe, expect, it } from 'vitest';

import { PSEUDO_WORKSPACES } from '@/lib/assemble.ts';
import { DEFAULT_CONFIG, readConfig, type Checkout } from '@/lib/config.ts';
import { APP_WORKSPACES, FEATURE_APPS, LOCAL_FEATURES } from '@/lib/features.ts';

/**
 * `census.config.json`: what a checkout measured with `--root` says about itself.
 * A file that is wrong stops the measure step before a suite runs, so every
 * problem has to come back at once, each naming where it is.
 */
const VALID = {
  repo: 'climaa/landing-lab',
  storybook: 'apps/storybook',
  sharedVitestConfig: 'vitest.sandcastle.config.mts',
  pseudoWorkspaces: [{ name: 'scripts/', path: 'scripts' }],
  apps: { web: 'apps/web', console: 'apps/visual-diff-ui' },
  features: { smoke: 'web', 'visual-diff-flow': 'console' },
  localFeatures: ['visual-diff-flow'],
};

/** A checkout that holds exactly what `VALID` names. */
function checkout(
  over: Partial<{ missing: string[]; featureNames: string[] }> = {},
): Checkout {
  const present = new Set([
    'apps/storybook/package.json',
    'apps/web/package.json',
    'apps/visual-diff-ui/package.json',
    'scripts',
    'vitest.sandcastle.config.mts',
  ]);
  for (const path of over.missing ?? []) present.delete(path);
  return {
    has: (path) => present.has(path),
    featureNames: over.featureNames ?? ['smoke', 'visual-diff-flow'],
  };
}

const problemsOf = (value: unknown, where = checkout()) => {
  const read = readConfig(value, where);
  return 'problems' in read ? read.problems : [];
};

describe('readConfig', () => {
  it('returns the config when the file and the checkout agree', () => {
    const read = readConfig(VALID, checkout());

    expect(read).toEqual({ config: VALID });
  });

  it('accepts a checkout with no shared vitest config', () => {
    const read = readConfig({ ...VALID, sharedVitestConfig: null }, checkout());

    expect('config' in read).toBe(true);
  });

  it('refuses a value that is not an object, naming the file', () => {
    const problems = problemsOf('nope');

    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^census\.config\.json: /);
  });

  it('refuses an unknown key', () => {
    const problems = problemsOf({ ...VALID, scope: '@lab' });

    expect(problems.join('\n')).toContain('scope');
  });

  it('names every missing key at once', () => {
    const problems = problemsOf({ repo: 'climaa/landing-lab' });

    expect(problems.map((p) => p.split(':')[0])).toEqual([
      'storybook',
      'sharedVitestConfig',
      'pseudoWorkspaces',
      'apps',
      'features',
      'localFeatures',
    ]);
  });

  it('refuses a repo that is not owner/name', () => {
    const problems = problemsOf({ ...VALID, repo: 'landing-lab' });

    expect(problems).toEqual(['repo: expected owner/name']);
  });

  it('refuses an app, and a Storybook, that name no workspace', () => {
    const problems = problemsOf(
      VALID,
      checkout({ missing: ['apps/web/package.json', 'apps/storybook/package.json'] }),
    );

    expect(problems).toEqual([
      'storybook: apps/storybook is not a workspace',
      'apps.web: apps/web is not a workspace',
    ]);
  });

  it('refuses a pseudo-workspace and a shared config that do not exist', () => {
    const problems = problemsOf(
      VALID,
      checkout({ missing: ['scripts', 'vitest.sandcastle.config.mts'] }),
    );

    expect(problems).toEqual([
      'pseudoWorkspaces.0.path: scripts does not exist',
      'sharedVitestConfig: vitest.sandcastle.config.mts does not exist',
    ]);
  });

  it('refuses a feature that names no app', () => {
    const problems = problemsOf({
      ...VALID,
      features: { ...VALID.features, smoke: 'blog' },
    });

    expect(problems).toEqual(['features.smoke: blog is not in apps']);
  });

  it('refuses a .feature file the config does not map', () => {
    const problems = problemsOf(
      VALID,
      checkout({ featureNames: ['smoke', 'visual-diff-flow', 'pricing'] }),
    );

    expect(problems).toEqual(['features: pricing.feature is not mapped to an app']);
  });

  it('refuses a mapped feature whose file is gone', () => {
    const problems = problemsOf(VALID, checkout({ featureNames: ['smoke'] }));

    expect(problems).toEqual([
      'features.visual-diff-flow: no visual-diff-flow.feature under apps/e2e/features',
    ]);
  });

  it('refuses a local feature that is not in the map', () => {
    const problems = problemsOf({ ...VALID, localFeatures: ['ghost'] });

    expect(problems).toEqual(['localFeatures.0: ghost is not in features']);
  });
});

describe('DEFAULT_CONFIG', () => {
  it('is this repository, from the constants the app reads', () => {
    expect(DEFAULT_CONFIG).toEqual({
      repo: 'climaa/acceptance-gate',
      storybook: 'apps/storybook',
      sharedVitestConfig: 'vitest.sandcastle.config.mts',
      pseudoWorkspaces: [...PSEUDO_WORKSPACES],
      apps: APP_WORKSPACES,
      features: FEATURE_APPS,
      localFeatures: [...LOCAL_FEATURES],
    });
  });
});
