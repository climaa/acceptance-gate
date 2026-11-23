import { describe, expect, it } from 'vitest';

import { searchIndex } from '@/lib/search.ts';
import { sample } from './sample';

const COMMIT = '0514dc9a3f6e2b7c8d1e4f5a6b7c8d9e0f1a2b3c';
const BLOB = `https://github.com/climaa/acceptance-gate/blob/${COMMIT}`;

describe('searchIndex', () => {
  const index = searchIndex(sample().measurement);
  const of = (kind: string) => index.entries.filter((e) => e.kind === kind);

  it('holds every workspace, linked to its directory at the commit', () => {
    // Assert
    expect(of('workspace')).toHaveLength(12);
    const ui = of('workspace').find((e) => e.title === '@gate/ui');
    expect(ui?.meta).toBe('packages');
    expect(index.hrefs[ui!.id]).toBe('/ui');
  });

  it('holds every measured file under its repository path', () => {
    const files = of('file');

    expect(files).toHaveLength(36);
    const badge = files.find((e) => e.title === 'packages/ui/src/atoms/Badge/Badge.tsx');
    expect(badge?.meta).toBe('@gate/ui');
    expect(index.hrefs[badge!.id]).toBe(`${BLOB}/packages/ui/src/atoms/Badge/Badge.tsx`);
  });

  it('holds a component for each PascalCase file, with its group', () => {
    const components = of('component').map((e) => [e.title, e.meta]);

    expect(components).toHaveLength(32);
    expect(components).toContainEqual(['PanZoom', 'organisms · @gate/ui']);
    expect(components).toContainEqual(['Badge', 'atoms · @gate/ui']);
    expect(components).toContainEqual(['RunPanel', 'components · @gate/visual-diff-ui']);
    expect(components.map(([title]) => title)).not.toContain('below-floor');
  });

  it('holds every gap, leading to its row on the page', () => {
    const gaps = of('gap');

    expect(gaps).toHaveLength(57);
    expect(gaps[0]).toMatchObject({
      title: '@gate/links: measure coverage',
      meta: 'unmeasured-workspace',
    });
    expect(index.hrefs[gaps[0]!.id]).toBe('#gap-unmeasured-workspace%3Apackages%2Flinks');
  });

  it('holds each feature an app is visited by, linked to its file', () => {
    const scenarios = of('scenario');

    expect(scenarios.map((e) => e.title)).toContain('visual-diff-shot');
    expect(scenarios).toHaveLength(9);
    expect(index.hrefs[scenarios[0]!.id]).toBe(
      `${BLOB}/apps/e2e/features/acceptance/visual-diff-console.feature`,
    );
  });

  it('gives every entry a unique id and an address', () => {
    const ids = index.entries.map((e) => e.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => index.hrefs[id] !== undefined)).toBe(true);
  });
});
