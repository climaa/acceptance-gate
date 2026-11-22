/**
 * The Visual dimension: what has a story, a tile on its design board and a
 * baseline, per `packages/ui` component, per app component and per screen story.
 *
 * Read from what the repository already commits or builds, never from a capture:
 * the built Storybook's `index.json` (which stories exist), every board's
 * `*.tiles.json` (which have a tile, named by variant key), and the tracked
 * `__baselines__` PNGs (which have a baseline, file name = variant key). A story
 * tagged `visual-diff:skip` is never captured, so it is never asked for a
 * baseline. A story drawn ahead of its code has a tile and no index entry: it is
 * not a subject until it exists.
 *
 * An app component counts as storied when a story file imports its module
 * directly; one only rendered inside another component is not.
 */
import { posix } from 'node:path';

import type { StoryPart } from '../gaps.ts';
import type { Workspace } from '../measurement.ts';

export interface Story {
  id: string;
  /** The story file, repo-relative. */
  file: string;
  /** Tagged `visual-diff:skip`: never captured, so never baselined. */
  skipped: boolean;
}

/** Where Storybook's `importPath`s are relative to. */
const STORYBOOK_DIR = 'apps/storybook';
const SKIP_TAG = 'visual-diff:skip';
const TIERS = new Set(['atoms', 'molecules', 'organisms', 'templates']);
const ROUTE_FILE =
  /^(page|layout|loading|error|not-found|global-error|global-not-found|template|default|route)\.tsx$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Every story in a built Storybook's `index.json`, docs pages left out. */
export function indexStories(index: unknown): Story[] {
  const entries = isRecord(index) ? index.entries : undefined;
  if (!isRecord(entries)) throw new Error('Not a Storybook index: no `entries` object');
  return Object.values(entries)
    .filter(isRecord)
    .filter((entry) => entry.type === 'story')
    .map((entry) => ({
      id: String(entry.id),
      file: posix.normalize(posix.join(STORYBOOK_DIR, String(entry.importPath))),
      skipped: Array.isArray(entry.tags) && entry.tags.includes(SKIP_TAG),
    }));
}

/** The story ids in a list of variant keys or baseline file names. */
export function storyIdsOf(keys: Iterable<string>): Set<string> {
  return new Set(
    [...keys].map((key) => (key.split('__').at(-1) ?? key).replace(/\.png$/, '')),
  );
}

const hasBaseline = (story: Story, baselined: ReadonlySet<string>) =>
  story.skipped || baselined.has(story.id);

/** Each story with the parts it lacks: the input `component-incomplete` gaps come from. */
export function storyParts(
  stories: readonly Story[],
  tiled: ReadonlySet<string>,
  baselined: ReadonlySet<string>,
): { storyId: string; missing: StoryPart[] }[] {
  return stories.map((story) => ({
    storyId: story.id,
    missing: [
      ...(tiled.has(story.id) ? [] : (['tile'] as const)),
      ...(hasBaseline(story, baselined) ? [] : (['baseline'] as const)),
    ],
  }));
}

/** How many of a component's stories exist, and whether all of them are tiled and baselined. */
function judge(
  stories: readonly Story[],
  tiled: ReadonlySet<string>,
  baselined: ReadonlySet<string>,
) {
  const storied = stories.length > 0;
  return {
    storied,
    tiled: storied && stories.every((s) => tiled.has(s.id)),
    baselined: storied && stories.every((s) => hasBaseline(s, baselined)),
  };
}

function counts(judged: readonly ReturnType<typeof judge>[]) {
  return {
    total: judged.length,
    storied: judged.filter((j) => j.storied).length,
    tiled: judged.filter((j) => j.tiled).length,
    baselined: judged.filter((j) => j.baselined).length,
  };
}

/**
 * The stories that speak for a `packages/ui` folder: its own, or, when it has
 * none, those of every story file importing a module inside it (a layout atom
 * drawn only inside other components' stories).
 */
function folderStories(
  folder: string,
  stories: readonly Story[],
  imports: ReadonlyMap<string, ReadonlySet<string>>,
): Story[] {
  const own = stories.filter((s) => s.file.startsWith(`${folder}/`));
  if (own.length > 0) return own;
  const importers = new Set(
    [...imports]
      .filter(([, targets]) => [...targets].some((t) => t.startsWith(`${folder}/`)))
      .map(([file]) => file),
  );
  return stories.filter((s) => importers.has(s.file));
}

/** Names once each, in first-seen order. */
const unique = (names: readonly string[]) => [...new Set(names)];

/** `packages/ui`: one component per folder under a tier, judged by the stories that speak for it. */
export function uiVisual(
  files: readonly string[],
  stories: readonly Story[],
  tiled: ReadonlySet<string>,
  baselined: ReadonlySet<string>,
  imports: ReadonlyMap<string, ReadonlySet<string>>,
) {
  const folders = [
    ...new Set(
      files
        .map((file) => file.split('/'))
        .filter(
          (parts) => parts.length >= 6 && parts[2] === 'src' && TIERS.has(parts[3] ?? ''),
        )
        .map((parts) => parts.slice(0, 5).join('/')),
    ),
  ].sort();
  const judged = folders.map((folder) => ({
    name: folder.split('/').at(-1) ?? folder,
    ...judge(folderStories(folder, stories, imports), tiled, baselined),
  }));
  const value: Workspace['dimensions']['visual'] = {
    dimension: 'visual',
    state: 'measured',
    components: counts(judged),
  };
  return {
    value,
    unstoried: unique(judged.filter((j) => !j.storied).map((j) => j.name)),
  };
}

export interface AppComponent {
  name: string;
  file: string;
}

const isComponentFile = (path: string) =>
  path.endsWith('.tsx') &&
  !ROUTE_FILE.test(posix.basename(path)) &&
  !/\.(stories|test)\.tsx$/.test(path) &&
  !path.includes('/_screens/') &&
  !path.includes('/__tests__/');

/** Every PascalCase function or const a component file exports, in source order. */
export function appComponents(
  files: readonly { path: string; source: string }[],
): AppComponent[] {
  return files
    .filter((file) => isComponentFile(file.path))
    .flatMap((file) =>
      [
        ...file.source.matchAll(
          /export\s+(?:default\s+)?(?:async\s+)?(?:function|const)\s+([A-Z]\w*)/g,
        ),
      ]
        .map((match) => String(match[1]))
        .filter((name) => /[a-z]/.test(name))
        .map((name) => ({ name, file: file.path })),
    );
}

/** A module path with its extension and any trailing `/index` dropped. */
const moduleId = (path: string) =>
  path.replace(/\.(tsx|ts|mts|jsx|js|mjs)$/, '').replace(/\/index$/, '');

/** The repo modules a story file imports, by relative or `@/` specifier (packages left out). */
export function storyImports(storyFile: string, source: string): Set<string> {
  const appRoot = storyFile.split('/').slice(0, 2).join('/');
  const targets = new Set<string>();
  for (const match of source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) {
    const spec = String(match[1]);
    if (spec.startsWith('.'))
      targets.add(moduleId(posix.join(posix.dirname(storyFile), spec)));
    else if (spec.startsWith('@/'))
      targets.add(moduleId(posix.join(appRoot, spec.slice(2))));
  }
  return targets;
}

interface AppInputs {
  components: readonly AppComponent[];
  /** Story file → the modules it imports. */
  imports: ReadonlyMap<string, ReadonlySet<string>>;
  stories: readonly Story[];
  tiled: ReadonlySet<string>;
  baselined: ReadonlySet<string>;
  routes?: NonNullable<
    Extract<Workspace['dimensions']['visual'], { state: 'measured' }>['routes']
  >;
}

/** An app: its components by the stories importing them, its screen stories, its routes. */
export function appVisual(appPath: string, inputs: AppInputs) {
  const { stories, tiled, baselined } = inputs;
  const judged = inputs.components.map((component) => {
    const id = moduleId(component.file);
    const files = new Set(
      [...inputs.imports].filter(([, t]) => t.has(id)).map(([file]) => file),
    );
    return {
      name: component.name,
      ...judge(
        stories.filter((s) => files.has(s.file)),
        tiled,
        baselined,
      ),
    };
  });
  const screens = stories.filter((s) => s.file.startsWith(`${appPath}/`));
  const value: Workspace['dimensions']['visual'] = {
    dimension: 'visual',
    state: 'measured',
    components: counts(judged),
    ...(screens.length === 0
      ? {}
      : {
          screens: {
            stories: screens.length,
            tiled: screens.filter((s) => tiled.has(s.id)).length,
            baselined: screens.filter((s) => hasBaseline(s, baselined)).length,
          },
        }),
    ...(inputs.routes === undefined ? {} : { routes: inputs.routes }),
  };
  return {
    value,
    unstoried: unique(judged.filter((j) => !j.storied).map((j) => j.name)),
  };
}
