import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { parseCommitted } from '@/lib/committed.ts';
import { homeView } from '@/lib/home.ts';

const FIXTURES = path.resolve(import.meta.dirname, '..', 'fixtures');
const text = (name: 'measurement' | 'history') =>
  readFileSync(path.join(FIXTURES, `${name}.json`), 'utf8');
const measured = () =>
  parseCommitted({ measurement: text('measurement'), history: text('history') });

/** The fixture is measured on 21 Nov 2026 at 18:30 UTC. */
const FIXTURE_DAY = Date.parse('2026-11-21T18:30:00.000Z');
const DAY = 86_400_000;

describe('homeView with no measurement committed', () => {
  const view = homeView({ state: 'empty' }, FIXTURE_DAY);

  it('is the empty state', () => {
    expect(view.state).toBe('empty');
  });

  it('lists the overview and the four dimensions, the overview current', () => {
    expect(view.dimensions.map((d) => [d.id, d.label, d.href, d.current])).toEqual([
      ['overview', 'Overview', '/', true],
      ['code', 'Code', '/?dimension=code', false],
      ['visual', 'Visual', '/?dimension=visual', false],
      ['acceptance', 'Acceptance', '/?dimension=acceptance', false],
      ['health', 'Health', '/?dimension=health', false],
    ]);
  });

  it('counts nothing, since nothing was measured', () => {
    expect(view.dimensions.map((d) => d.count)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });
});

describe('homeView with a measurement committed', () => {
  it('counts the open gaps per dimension, the overview all of them', () => {
    const view = homeView(measured(), FIXTURE_DAY);

    expect(view.dimensions.map((d) => d.count)).toEqual([3, 1, 1, 1, 0]);
  });

  it('labels each dimension filter with its gaps, after All', () => {
    const view = homeView(measured(), FIXTURE_DAY);

    expect(view.state === 'measured' && view.filters.dimensions).toEqual([
      { value: 'all', label: 'All 3' },
      { value: 'code', label: 'Code 1' },
      { value: 'visual', label: 'Visual 1' },
      { value: 'acceptance', label: 'Acceptance 1' },
      { value: 'health', label: 'Health 0' },
    ]);
  });

  it('labels the dimensions without counts for a phone, as the mobile tile draws them', () => {
    const view = homeView(measured(), FIXTURE_DAY);

    expect(view.state === 'measured' && view.filters.dimensionsShort).toEqual([
      { value: 'all', label: 'All' },
      { value: 'code', label: 'Code' },
      { value: 'visual', label: 'Visual' },
      { value: 'acceptance', label: 'Acceptance' },
      { value: 'health', label: 'Health' },
    ]);
  });

  it('offers every category after All', () => {
    const view = homeView(measured(), FIXTURE_DAY);

    expect(view.state === 'measured' && view.filters.categories).toEqual([
      { value: 'all', label: 'All' },
      { value: 'packages', label: 'packages' },
      { value: 'apps', label: 'apps' },
      { value: 'scripts', label: 'scripts' },
    ]);
  });

  const statusOf = (name: string, committed = measured()) =>
    homeView(committed, FIXTURE_DAY).workspaces.find((ws) => ws.name === name)?.status;

  it('marks a workspace whose Code is measured as measured', () => {
    const status = statusOf('@gate/ui');

    expect(status).toBe('measured');
  });

  it('keeps it measured with gaps open and coverage under the floor', () => {
    const committed = measured();
    if (committed.state === 'empty') throw new Error('the fixture is measured');
    const [gap] = committed.measurement.gaps;
    const ui = committed.measurement.workspaces.find((ws) => ws.name === '@gate/ui');
    if (!gap || ui?.dimensions.code.state !== 'measured')
      throw new Error('the fixture lost its gap or the measured Code of @gate/ui');
    ui.dimensions.code.lines.pct = 1;
    committed.measurement.gaps.push({ ...gap, workspace: '@gate/ui' });

    const status = statusOf('@gate/ui', committed);

    expect(status).toBe('measured');
  });

  it('marks a workspace whose Code is unmeasured as unmeasured, with no gap open', () => {
    const committed = measured();
    if (committed.state === 'empty') throw new Error('the fixture is measured');
    committed.measurement.gaps = [];

    const status = statusOf('@gate/blog', committed);

    expect(status).toBe('unmeasured');
  });

  it('marks a workspace with no code as not-applicable, whatever its gaps', () => {
    const committed = measured();
    if (committed.state === 'empty') throw new Error('the fixture is measured');
    const [gap] = committed.measurement.gaps;
    if (!gap) throw new Error('the fixture lost its gap');
    committed.measurement.gaps.push({ ...gap, workspace: '@gate/tsconfig' });

    const status = statusOf('@gate/tsconfig', committed);

    expect(status).toBe('not-applicable');
  });

  it('links the short commit to the commit on GitHub', () => {
    const view = homeView(measured(), FIXTURE_DAY);

    expect(view.state === 'measured' && view.meta.commit).toEqual({
      short: 'aebf7ec',
      href: 'https://github.com/climaa/acceptance-gate/commit/aebf7ece432666dc6fa20608fbbbc0dc8f8e1319',
    });
  });

  it('dates the measurement as day, month and year in UTC', () => {
    const view = homeView(measured(), FIXTURE_DAY);

    expect(view.state === 'measured' && view.meta.date).toBe('21 Nov 2026');
  });

  it('lists the measuring tools with their versions, not the runtime', () => {
    const view = homeView(measured(), FIXTURE_DAY);

    expect(view.state === 'measured' && view.meta.tools).toEqual([
      'vitest 5.0.5',
      'fallow 3.36.0',
      'storybook 10.6.2',
    ]);
  });

  it('is not stale within fourteen days', () => {
    const view = homeView(measured(), FIXTURE_DAY + 14 * DAY);

    expect(view.state === 'measured' && view.meta.staleDays).toBeNull();
  });

  it('is stale by its age in days once older than fourteen', () => {
    const view = homeView(measured(), FIXTURE_DAY + 21 * DAY);

    expect(view.state === 'measured' && view.meta.staleDays).toBe(21);
  });

  it('leads each sidebar workspace to its page', () => {
    const view = homeView(measured(), FIXTURE_DAY);

    expect(view.workspaces.map((ws) => [ws.name, ws.href])).toEqual([
      ['@gate/ui', '/ui'],
      ['@gate/blog', '/blog'],
      ['@gate/manual', '/manual'],
      ['@gate/tsconfig', '/tsconfig'],
    ]);
  });

  it('points GitHub at the measured repository', () => {
    const view = homeView(measured(), FIXTURE_DAY);

    expect(view.githubHref).toBe('https://github.com/climaa/acceptance-gate');
  });
});
