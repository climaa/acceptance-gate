import { readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  APP_WORKSPACES,
  FEATURE_APPS,
  LOCAL_FEATURES,
  featureName,
  featureWorkspace,
  unmappedFeatures,
} from '@/lib/features.ts';

const FEATURES = path.resolve(import.meta.dirname, '..', '..', 'e2e', 'features');

/** Every `.feature` the acceptance suite owns, relative to `features/`. */
function featureFiles(): string[] {
  return readdirSync(FEATURES, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.feature'))
    .map((file) => file.split(path.sep).join('/'));
}

describe('the feature map against apps/e2e/features', () => {
  it('maps every feature the suite has, so none goes uncounted', () => {
    const names = featureFiles().map(featureName);

    const unmapped = unmappedFeatures(names);

    expect(unmapped).toEqual([]);
  });

  it('has no entry for a feature that no longer exists', () => {
    const names = new Set(featureFiles().map(featureName));

    const stale = Object.keys(FEATURE_APPS).filter((name) => !names.has(name));

    expect(stale).toEqual([]);
  });

  it('names each feature once across acceptance/ and local/', () => {
    const names = featureFiles().map(featureName);

    expect(new Set(names).size).toBe(names.length);
  });

  it('lists exactly the features under local/ as local', () => {
    const local = featureFiles()
      .filter((file) => file.startsWith('local/'))
      .map(featureName);

    expect([...LOCAL_FEATURES].sort()).toEqual(local.sort());
  });
});

describe('unmappedFeatures', () => {
  it('returns the names the map does not know, in order', () => {
    const unmapped = unmappedFeatures(['smoke', 'checkout', 'visual-diff-shot', 'cart']);

    expect(unmapped).toEqual(['checkout', 'cart']);
  });

  it('does not take an inherited property for a mapped feature', () => {
    const unmapped = unmappedFeatures(['toString', 'constructor']);

    expect(unmapped).toEqual(['toString', 'constructor']);
  });
});

describe('featureName', () => {
  it('drops the directory and the extension', () => {
    const name = featureName('acceptance/visual-diff-shot.feature');

    expect(name).toBe('visual-diff-shot');
  });
});

describe('featureWorkspace', () => {
  it("names the workspace the feature's app is built from", () => {
    const workspace = featureWorkspace('visual-diff-report');

    expect(workspace).toBe(APP_WORKSPACES.console);
  });

  it('is undefined for an unmapped feature', () => {
    const workspace = featureWorkspace('checkout');

    expect(workspace).toBeUndefined();
  });
});

describe('featureName without a directory or extension', () => {
  it('returns the name as given', () => {
    expect(featureName('smoke')).toBe('smoke');
  });
});
