import { describe, expect, it } from 'vitest';

import { historyPoint } from '@/lib/assemble.ts';
import { acceptanceValues } from '@/lib/collect/acceptance.ts';
import { indexStories } from '@/lib/collect/visual.ts';
import {
  FEATURE_MAP,
  featureWorkspace,
  unmappedFeatures,
  type FeatureMap,
} from '@/lib/features.ts';
import { deriveGaps } from '@/lib/gaps.ts';
import { validateMeasurement } from '@/lib/validate.ts';

import { sample } from './sample.ts';

/**
 * The rules that read the feature → app map take another repository's map when
 * `census:measure --root` hands them one, and this repository's when it does not.
 * Each test gives the same input to both and expects two different answers.
 */
const CHILD: FeatureMap = {
  apps: { web: 'apps/web', console: 'apps/visual-diff-ui' },
  features: { smoke: 'web', pricing: 'web', 'visual-diff-flow': 'console' },
  localFeatures: ['visual-diff-flow'],
};

/** The sample measurement, as if it had measured the child: one workspace at `apps/web`. */
function childMeasurement(scenarios: number) {
  const { measurement } = sample();
  const first = measurement.workspaces[0]!;
  return {
    ...measurement,
    gaps: [],
    workspaces: [
      {
        ...first,
        name: '@lab/web',
        path: 'apps/web',
        dimensions: {
          ...first.dimensions,
          code: { dimension: 'code', state: 'not-applicable', reason: 'n/a' },
          visual: { dimension: 'visual', state: 'not-applicable', reason: 'n/a' },
          acceptance: {
            dimension: 'acceptance',
            state: 'measured',
            scenarios,
            features: scenarios > 0 ? ['smoke'] : [],
          },
        },
      },
    ],
  } as typeof measurement;
}

describe('the feature map of another repository', () => {
  it('this repository’s map is the three constants', () => {
    expect(Object.keys(FEATURE_MAP.apps)).toContain('census');
    expect(FEATURE_MAP.features.census).toBe('census');
    expect(FEATURE_MAP.localFeatures).toContain('visual-diff-flow');
  });

  it('unmappedFeatures reads the map it is given', () => {
    const names = ['smoke', 'pricing', 'census'];

    expect(unmappedFeatures(names, CHILD)).toEqual(['census']);
    expect(unmappedFeatures(names)).toEqual(['pricing']);
  });

  it('featureWorkspace resolves through the given apps, and knows no app it does not list', () => {
    expect(featureWorkspace('smoke', CHILD)).toBe('apps/web');
    expect(featureWorkspace('smoke')).toBe('apps/blog');
    expect(featureWorkspace('smoke', { ...CHILD, features: { smoke: 'blog' } })).toBe(
      undefined,
    );
  });

  it('acceptanceValues gives a value to each app of the given map, local features left out', () => {
    const values = acceptanceValues(
      { smoke: 2, pricing: 3, 'visual-diff-flow': 4 },
      CHILD,
    );

    expect(values).toEqual({
      'apps/web': {
        dimension: 'acceptance',
        state: 'measured',
        scenarios: 5,
        features: ['pricing', 'smoke'],
      },
      'apps/visual-diff-ui': {
        dimension: 'acceptance',
        state: 'measured',
        scenarios: 0,
        features: [],
      },
    });
  });

  it('deriveGaps calls an app unvisited only when the given map deploys it', () => {
    const { workspaces } = childMeasurement(0);

    const child = deriveGaps(workspaces, {}, CHILD);
    const home = deriveGaps(workspaces, {});

    expect(child.map((gap) => gap.kind)).toEqual(['app-unvisited']);
    expect(home).toEqual([]);
  });

  it('historyPoint’s acceptance headline counts the given map’s apps', () => {
    const extra = { visual: null, dupPct: 0, overCeiling: 0 };

    expect(historyPoint(childMeasurement(2), extra, CHILD).dimensions.acceptance).toBe(
      100,
    );
    expect(historyPoint(childMeasurement(0), extra, CHILD).dimensions.acceptance).toBe(0);
    expect(historyPoint(childMeasurement(2), extra).dimensions.acceptance).toBeNull();
  });

  it('validateMeasurement checks a feature against the given map', () => {
    const measurement = childMeasurement(2);

    expect(validateMeasurement(measurement, CHILD)).toEqual([]);
    expect(validateMeasurement(measurement)).toEqual([
      'workspaces.0.dimensions.acceptance.features.0: smoke visits apps/blog, not apps/web',
    ]);
  });

  it('indexStories places a story under the Storybook workspace it is told', () => {
    const index = {
      entries: {
        a: { type: 'story', id: 'a', importPath: '../../packages/ui/a.stories.tsx' },
      },
    };

    expect(indexStories(index, 'tools/sb')[0]!.file).toBe('packages/ui/a.stories.tsx');
    expect(indexStories(index, 'sb')[0]!.file).toBe('../packages/ui/a.stories.tsx');
    expect(indexStories(index)[0]!.file).toBe('packages/ui/a.stories.tsx');
  });
});
