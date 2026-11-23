import { describe, expect, it } from 'vitest';

import { NO_FILTER } from '@/lib/filter.ts';
import { frameAt } from '@/lib/frame.ts';
import { homeView } from '@/lib/home.ts';
import { sample, SAMPLE_DAY } from './sample';

const GITHUB = 'https://github.com/climaa/acceptance-gate';
const view = homeView({ state: 'measured', ...sample() }, SAMPLE_DAY);

describe('frameAt on the home', () => {
  it('crumbs to the overview and lights it, with the filter band', () => {
    const frame = frameAt(view, NO_FILTER, '/');

    expect(frame.breadcrumb).toEqual([
      { label: 'acceptance-gate', href: GITHUB },
      { label: 'census', href: '/' },
      { label: 'Overview' },
    ]);
    expect(frame.dimensions.filter((d) => d.current).map((d) => d.id)).toEqual([
      'overview',
    ]);
    expect(frame.workspaces.some((ws) => ws.current)).toBe(false);
    expect(frame.band).toBe('filters');
  });

  it('crumbs to and lights the dimension a filter names', () => {
    const frame = frameAt(view, { dimension: 'code', category: null }, '/');

    expect(frame.breadcrumb.at(-1)).toEqual({ label: 'Code' });
    expect(frame.dimensions.filter((d) => d.current).map((d) => d.id)).toEqual(['code']);
  });
});

describe('frameAt on a workspace page', () => {
  it('crumbs through the category to the workspace, which the sidebar lights', () => {
    const frame = frameAt(view, NO_FILTER, '/ui');

    expect(frame.breadcrumb).toEqual([
      { label: 'acceptance-gate', href: GITHUB },
      { label: 'census', href: '/' },
      { label: 'packages', href: '/?category=packages' },
      { label: '@gate/ui' },
    ]);
    expect(frame.workspaces.filter((ws) => ws.current).map((ws) => ws.name)).toEqual([
      '@gate/ui',
    ]);
    expect(frame.dimensions.some((d) => d.current)).toBe(false);
  });

  it('draws the band with the measurement alone: there is nothing to filter', () => {
    expect(frameAt(view, NO_FILTER, '/blog').band).toBe('meta');
  });

  it('ignores a trailing slash', () => {
    const frame = frameAt(view, NO_FILTER, '/blog/');

    expect(frame.breadcrumb.at(-1)).toEqual({ label: '@gate/blog' });
  });
});

describe('frameAt anywhere else', () => {
  it('is the home frame for an address no workspace has', () => {
    const frame = frameAt(view, NO_FILTER, '/nowhere');

    expect(frame.band).toBe('filters');
    expect(frame.breadcrumb.at(-1)).toEqual({ label: 'Overview' });
  });

  it('is the home frame with nothing measured', () => {
    const empty = homeView({ state: 'empty' }, SAMPLE_DAY);

    const frame = frameAt(empty, NO_FILTER, '/ui');

    expect(frame.band).toBe('filters');
    expect(frame.workspaces).toEqual([]);
  });
});
