import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  PSEUDO_WORKSPACES,
  categoryOf,
  gapCounts,
  gapDiff,
  historyPoint,
  visualHeadline,
  withPoint,
} from '@/lib/assemble.ts';
import type { History, Measurement } from '@/lib/measurement.ts';

const FIXTURES = path.resolve(import.meta.dirname, '..', 'fixtures');
const measurement: Measurement = JSON.parse(
  readFileSync(path.join(FIXTURES, 'measurement.json'), 'utf8'),
);
const history: History = JSON.parse(
  readFileSync(path.join(FIXTURES, 'history.json'), 'utf8'),
);

describe('categoryOf', () => {
  it('puts each workspace in its category', () => {
    expect(categoryOf('packages/ui')).toBe('packages');
    expect(categoryOf('apps/blog')).toBe('apps');
    expect(categoryOf('.sandcastle')).toBe('scripts');
  });

  it('puts every pseudo-workspace under scripts', () => {
    expect(PSEUDO_WORKSPACES.map((ws) => categoryOf(ws.path))).toEqual([
      'scripts',
      'scripts',
      'scripts',
    ]);
  });
});

describe('visualHeadline', () => {
  it('is the share of stories with nothing missing', () => {
    const pct = visualHeadline([
      { storyId: 'a', missing: [] },
      { storyId: 'b', missing: ['tile'] },
      { storyId: 'c', missing: [] },
    ]);

    expect(pct).toBe(66.7);
  });

  it('is null with no story to judge', () => {
    expect(visualHeadline([])).toBeNull();
  });
});

describe('historyPoint', () => {
  it("takes Code from the measured workspaces' lines and Health from fallow's score", () => {
    const point = historyPoint(measurement, {
      visual: 62.5,
      dupPct: 1.6,
      overCeiling: 3,
    });

    expect(point).toEqual({
      commit: measurement.commit,
      measuredAt: measurement.measuredAt,
      dimensions: { code: 98.9, visual: 62.5, acceptance: 50, health: 81.4 },
      fallow: {
        score: 81.4,
        grade: 'B',
        dupPct: 1.6,
        crapOver: 19,
        overCeiling: 3,
        deadFiles: measurement.health.dead.files,
      },
    });
  });

  it('gives Code null when no workspace measures it', () => {
    const unmeasured = {
      ...measurement,
      workspaces: measurement.workspaces.filter(
        (ws) => ws.dimensions.code.state !== 'measured',
      ),
    };

    const point = historyPoint(unmeasured, { visual: null, dupPct: 1.6, overCeiling: 0 });

    expect(point.dimensions.code).toBeNull();
  });
});

describe('withPoint', () => {
  it('appends a point for a new commit', () => {
    const point = {
      ...history.points[1]!,
      commit: 'c'.repeat(40),
      measuredAt: '2026-11-22T10:00:00.000Z',
    };

    const next = withPoint(history, point);

    expect(next.points.map((p) => p.commit)).toEqual([
      history.points[0]!.commit,
      history.points[1]!.commit,
      'c'.repeat(40),
    ]);
  });

  it('replaces the point of a commit measured again', () => {
    const again = { ...history.points[1]!, measuredAt: '2026-11-22T10:00:00.000Z' };

    const next = withPoint(history, again);

    expect(next.points).toHaveLength(2);
    expect(next.points[1]?.measuredAt).toBe('2026-11-22T10:00:00.000Z');
  });

  it('starts a history when none is committed', () => {
    const next = withPoint(undefined, history.points[0]!);

    expect(next).toEqual({ schema: 1, points: [history.points[0]] });
  });
});

describe('gapCounts', () => {
  it('counts every kind, zero included', () => {
    const counts = gapCounts(measurement.gaps);

    expect(counts).toEqual({
      'unmeasured-workspace': 1,
      'uncovered-file': 0,
      'component-incomplete': 1,
      'story-missing': 0,
      'route-state-missing': 0,
      'app-unvisited': 1,
    });
  });
});

describe('gapDiff', () => {
  it('names the gaps opened and closed since the committed measurement', () => {
    const next = [
      measurement.gaps[0]!,
      { ...measurement.gaps[1]!, id: 'story-missing:apps/blog:PostCard' },
    ];

    const diff = gapDiff(measurement.gaps, next);

    expect(diff).toEqual({
      opened: ['story-missing:apps/blog:PostCard'],
      closed: [
        'component-incomplete:apps/blog:screens-blog-about--default',
        'app-unvisited:apps/manual',
      ],
    });
  });

  it('opens every gap when nothing is committed yet', () => {
    const diff = gapDiff(undefined, measurement.gaps);

    expect(diff.opened).toHaveLength(3);
  });
});

describe('historyPoint without a deployed app', () => {
  it('gives Acceptance null when the measurement holds no deployed app', () => {
    const packagesOnly = {
      ...measurement,
      workspaces: measurement.workspaces.filter((ws) => ws.category === 'packages'),
    };

    const point = historyPoint(packagesOnly, { visual: null, dupPct: 0, overCeiling: 0 });

    expect(point.dimensions.acceptance).toBeNull();
  });
});
