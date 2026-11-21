import { describe, expect, it } from 'vitest';

import { routeStates, routeSummary } from '@/lib/collect/routes.ts';

/** The blog's App Router files as `git ls-files` lists them, relative to `app/`. */
const BLOG = [
  'page.tsx',
  'layout.tsx',
  'error.tsx',
  'not-found.tsx',
  'global-error.tsx',
  'about/page.tsx',
  'blog/page.tsx',
  'blog/loading.tsx',
  'blog/[slug]/page.tsx',
  'blog/[slug]/loading.tsx',
  'blog/page/[n]/page.tsx',
  'og/site.png/route.tsx',
  'tags/[tag]/page.tsx',
];

describe('routeStates', () => {
  it('lists one route per page, by its URL path', () => {
    const routes = routeStates(BLOG).map((r) => r.route);

    expect(routes).toEqual([
      '/',
      '/about',
      '/blog',
      '/blog/[slug]',
      '/blog/page/[n]',
      '/tags/[tag]',
    ]);
  });

  it('calls a boundary own in the route directory and inherited from an ancestor', () => {
    const routes = routeStates(BLOG);

    expect(routes.find((r) => r.route === '/blog/page/[n]')).toEqual({
      route: '/blog/page/[n]',
      loading: 'inherited',
      error: 'inherited',
      notFound: 'inherited',
    });
  });

  it('calls a boundary none when neither the route nor an ancestor has one', () => {
    const routes = routeStates(BLOG);

    expect(routes.find((r) => r.route === '/about')?.loading).toBe('none');
  });

  it('calls the root boundaries own for the root route', () => {
    const routes = routeStates(BLOG);

    expect(routes.find((r) => r.route === '/')).toMatchObject({
      error: 'own',
      notFound: 'own',
    });
  });

  it('drops a route group from the URL but keeps its boundaries', () => {
    const routes = routeStates(['(site)/loading.tsx', '(site)/about/page.tsx']);

    expect(routes).toEqual([
      { route: '/about', loading: 'inherited', error: 'none', notFound: 'none' },
    ]);
  });

  it('skips parallel slots, intercepting routes and private folders', () => {
    const routes = routeStates([
      'set/[label]/page.tsx',
      'set/[label]/@modal/default.tsx',
      'set/[label]/@modal/(.)shot/[key]/page.tsx',
      '_screens/home.page.tsx',
      '_components/x/page.tsx',
    ]);

    expect(routes.map((r) => r.route)).toEqual(['/set/[label]']);
  });

  it('takes an .mdx or .ts page as a page', () => {
    const routes = routeStates(['notes/page.mdx', 'feed/page.ts']);

    expect(routes.map((r) => r.route)).toEqual(['/feed', '/notes']);
  });
});

describe('routeSummary', () => {
  it('counts own, inherited and none per boundary', () => {
    const summary = routeSummary(routeStates(BLOG));

    expect(summary).toEqual({
      total: 6,
      loading: { own: 2, inherited: 1, none: 3 },
      error: { own: 1, inherited: 5, none: 0 },
      notFound: { own: 1, inherited: 5, none: 0 },
    });
  });
});
