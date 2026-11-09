import * as fs from 'node:fs';
import * as path from 'node:path';
// Imported explicitly rather than relying on `globals: true` — tsconfig includes
// this file, so tsc typechecks it.
import { APP_ROOTS, APPS } from '@gate/visual-diff/policy';
import { describe, expect, it } from 'vitest';

/**
 * Every route is a screen (designs/STANDARD.md, "Every route is a screen").
 *
 * Each screen story declares the routes it stands for, on its meta:
 * `parameters: { screen: { routes: ['/blog/[slug]'] } }`, each spelled as the
 * directories under `app/` spell it. This suite lists every page the app router
 * serves and fails on a page no story claims — a route added without its screen
 * — and on a claim no page answers, which is a route renamed or deleted under a
 * story that still says it draws it.
 *
 * Read off the files rather than off a Storybook build, as `screen-titles.test.ts`
 * reads titles, so it runs in `test` with nothing built.
 */

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');

const PAGE_FILE = /^page\.(tsx|ts|jsx|js|mdx)$/;

/** Every file under `dir` whose name `match` accepts, depth first. Folders whose
 *  name starts with `_` are private to the app router and serve no route. */
const filesUnder = (dir: string, match: (name: string) => boolean): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'node_modules' ? [] : filesUnder(full, match);
    }

    return match(entry.name) ? [full] : [];
  });

/**
 * The address a page answers, as its route pattern: `@slot` folders and `(group)`
 * folders are not in the URL, and an intercepting folder's `(.)`, `(..)` or `(...)`
 * marker is dropped from the segment it intercepts — `/report/[id]/@modal/(.)
 * compare/[key]` is `/report/[id]/compare/[key]` drawn as a modal, the same route.
 */
export const routeOf = (appDir: string, pageFile: string): string => {
  const segments = path
    .relative(appDir, path.dirname(pageFile))
    .split(path.sep)
    .filter((segment) => segment !== '')
    .filter((segment) => !segment.startsWith('@'))
    .filter((segment) => !/^\([^.)][^)]*\)$/.test(segment))
    .map((segment) => segment.replace(/^(\(\.{1,3}\))+/, ''));

  return `/${segments.join('/')}`;
};

const SCREEN = /screen:\s*\{\s*routes:\s*\[((?:\s*'[^']*'\s*,?)*)\s*\]/;
const QUOTED = /'([^']*)'/g;

/** The routes a story file claims, or `null` when it declares none at all. */
export const claimsOf = (source: string): string[] | null => {
  const list = SCREEN.exec(source)?.[1];
  if (list === undefined) return null;

  return [...list.matchAll(QUOTED)].map((match) => match[1] ?? '');
};

const apps = APP_ROOTS.map((root, index) => {
  const appDir = path.join(REPO_ROOT, ...root);
  const isPrivate = (file: string) =>
    path
      .relative(appDir, file)
      .split(path.sep)
      .some((segment) => segment.startsWith('_'));

  const pages = filesUnder(appDir, (name) => PAGE_FILE.test(name)).filter(
    (file) => !isPrivate(file),
  );
  const stories = filesUnder(appDir, (name) => name.endsWith('.stories.tsx')).map(
    (file) => ({
      file: path.relative(REPO_ROOT, file),
      claims: claimsOf(fs.readFileSync(file, 'utf8')),
    }),
  );

  return {
    app: APPS[index] ?? '',
    routes: [...new Set(pages.map((page) => routeOf(appDir, page)))].sort(),
    stories,
  };
});

const claimed = (app: (typeof apps)[number]) =>
  new Set(app.stories.flatMap((story) => story.claims ?? []));

describe('screen routes', () => {
  // Without these, every `it.each` below passes on an empty list the day the
  // layout of `app/` changes.
  it.each(apps)('finds the pages of apps/$app', ({ routes }) => {
    expect(routes.length).toBeGreaterThan(0);
  });

  it.each(apps)('finds the screen stories of apps/$app', ({ stories }) => {
    expect(stories.length).toBeGreaterThan(0);
  });

  it.each(apps.flatMap((app) => app.stories))(
    '$file declares the routes it draws',
    ({ claims }) => {
      expect(claims).not.toBeNull();
    },
  );

  it.each(apps)('every page of apps/$app has a screen', (app) => {
    const unclaimed = app.routes.filter((route) => !claimed(app).has(route));

    expect(unclaimed).toEqual([]);
  });

  it.each(apps)('every route a screen of apps/$app claims is a page', (app) => {
    const stale = [...claimed(app)].filter((route) => !app.routes.includes(route));

    expect(stale).toEqual([]);
  });
});

describe('routeOf', () => {
  const appDir = path.join('repo', 'apps', 'x', 'app');
  const at = (...segments: string[]) => path.join(appDir, ...segments, 'page.tsx');

  it('reads the root page as /', () => {
    expect(routeOf(appDir, at())).toBe('/');
  });

  it('keeps dynamic segments as written', () => {
    expect(routeOf(appDir, at('blog', '[slug]'))).toBe('/blog/[slug]');
  });

  it('drops a route group', () => {
    expect(routeOf(appDir, at('[locale]', 'adult', '(household)', '[id]'))).toBe(
      '/[locale]/adult/[id]',
    );
  });

  it('reads an intercepting route in a slot as the route it intercepts', () => {
    expect(routeOf(appDir, at('report', '[id]', '@modal', '(.)compare', '[key]'))).toBe(
      '/report/[id]/compare/[key]',
    );
  });

  it('drops a deeper interception marker', () => {
    expect(routeOf(appDir, at('feed', '@modal', '(..)(..)photo', '[id]'))).toBe(
      '/feed/photo/[id]',
    );
  });
});

describe('claimsOf', () => {
  it('reads the routes a meta declares', () => {
    const source = "parameters: { screen: { routes: ['/blog', '/blog/page/[n]'] } },";

    expect(claimsOf(source)).toEqual(['/blog', '/blog/page/[n]']);
  });

  it('reads a declaration that names no route', () => {
    expect(claimsOf('parameters: { screen: { routes: [] } },')).toEqual([]);
  });

  it('answers null for a story that declares nothing', () => {
    expect(claimsOf("title: 'Screens/Blog/Home',")).toBeNull();
  });
});
