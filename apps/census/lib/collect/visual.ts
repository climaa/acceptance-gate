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
 * An app component counts as storied when a screen story renders it: a story
 * file imports its module directly, or reaches that module through static
 * imports and re-exports inside the same app and some module it reached writes
 * the component as JSX. A type-only import, a dynamic `import()`, another
 * workspace's module and a test lead nowhere.
 */
import { posix } from 'node:path';

import type { StoryPart } from '../gaps.ts';
import type { InventoryItem, Workspace } from '../measurement.ts';

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
/** App Router special files, metadata image routes (`icon2.tsx`) included: none is a component. */
const ROUTE_FILE =
  /^(page|layout|loading|error|not-found|global-error|global-not-found|template|default|route|(opengraph-image|twitter-image|icon|apple-icon)\d*)\.tsx$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Every story in a built Storybook's `index.json`, docs pages left out.
 * `storybookDir` is the workspace that built it, repo-relative.
 */
export function indexStories(index: unknown, storybookDir = STORYBOOK_DIR): Story[] {
  const entries = isRecord(index) ? index.entries : undefined;
  if (!isRecord(entries)) throw new Error('Not a Storybook index: no `entries` object');
  return Object.values(entries)
    .filter(isRecord)
    .filter((entry) => entry.type === 'story')
    .map((entry) => ({
      id: String(entry.id),
      file: posix.normalize(posix.join(storybookDir, String(entry.importPath))),
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

/** Story id → the stem of the design board its tile is on. */
export type Boards = ReadonlyMap<string, string>;

/** One inventory row: the story its links open, and the board when every story is tiled. */
function inventoryItem(
  name: string,
  tier: string,
  stories: readonly Story[],
  judged: { tiled: boolean; baselined: boolean },
  boards: Boards,
): InventoryItem {
  const story = stories[0]?.id;
  const board = story === undefined || !judged.tiled ? undefined : boards.get(story);
  return {
    name,
    tier,
    ...(story === undefined ? {} : { story }),
    tiled: judged.tiled,
    ...(board === undefined ? {} : { board }),
    baselined: judged.baselined,
  };
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
  boards: Boards = new Map(),
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
  const judged = folders.map((folder) => {
    const own = folderStories(folder, stories, imports);
    const name = folder.split('/').at(-1) ?? folder;
    const verdict = judge(own, tiled, baselined);
    return {
      name,
      ...verdict,
      item: inventoryItem(name, folder.split('/')[3] ?? '', own, verdict, boards),
    };
  });
  const value: Workspace['dimensions']['visual'] = {
    dimension: 'visual',
    state: 'measured',
    components: counts(judged),
    inventory: judged.map((j) => j.item),
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

/** A relative or `@/` specifier as a repo module id; any other (a package) as undefined. */
function resolveSpecifier(file: string, spec: string): string | undefined {
  if (spec.startsWith('.')) return moduleId(posix.join(posix.dirname(file), spec));
  if (spec.startsWith('@/'))
    return moduleId(posix.join(file.split('/').slice(0, 2).join('/'), spec.slice(2)));
  return undefined;
}

/** The repo modules a story file imports, by relative or `@/` specifier (packages left out). */
export function storyImports(storyFile: string, source: string): Set<string> {
  const targets = new Set<string>();
  for (const match of source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) {
    const target = resolveSpecifier(storyFile, String(match[1]));
    if (target !== undefined) targets.add(target);
  }
  return targets;
}

/** What one app module contributes to the walk from a story file. */
export interface AppModule {
  /** The repo modules it imports or re-exports as values, by relative or `@/` specifier. */
  imports: ReadonlySet<string>;
  /** The PascalCase names it writes as JSX (`<Name`). */
  renders: ReadonlySet<string>;
}

/**
 * Value imports and re-exports, the clause limited to names, braces and `*` so
 * no statement's body is read as one. Type-only ones are told apart by `type`.
 */
const STATIC_IMPORT =
  /\b(?:import|export)\s+(type\s+)?([\w\s{},*$]*?)\s*\bfrom\s+['"]([^'"]+)['"]/g;
/** A JSX opening tag: not a generic argument, which follows a name. */
const JSX_TAG = /(?<![\w$.])<([A-Z][\w$]*)(?=[\s/>])/g;

/** `import { type A, type B }`: every named specifier is a type. */
const allTypes = (clause: string) => {
  const named = /^\{([^}]*)\}$/.exec(clause.trim())?.[1];
  if (named === undefined) return false;
  const specifiers = named
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return specifiers.length > 0 && specifiers.every((s) => /^type\s/.test(s));
};

function moduleImports(file: string, source: string): Set<string> {
  const targets = new Set<string>();
  for (const match of source.matchAll(STATIC_IMPORT)) {
    if (match[1] !== undefined || allTypes(String(match[2]))) continue;
    const target = resolveSpecifier(file, String(match[3]));
    if (target !== undefined) targets.add(target);
  }
  return targets;
}

/** Module id → what it imports and renders, for each of an app's source files. */
export function appModules(
  files: readonly { path: string; source: string }[],
): Map<string, AppModule> {
  return new Map(
    files.map((file) => [
      moduleId(file.path),
      {
        imports: moduleImports(file.path, file.source),
        renders: new Set([...file.source.matchAll(JSX_TAG)].map((m) => String(m[1]))),
      },
    ]),
  );
}

/** The modules inside the app a story file reaches, itself included; a cycle ends the walk. */
function reached(
  appPath: string,
  storyFile: string,
  modules: ReadonlyMap<string, AppModule>,
): string[] {
  const seen = new Set([moduleId(storyFile)]);
  const queue = [...seen];
  for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
    for (const next of modules.get(id)?.imports ?? []) {
      if (seen.has(next) || !next.startsWith(`${appPath}/`)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return [...seen];
}

/** Whether a story file's walk reaches a component's module and some reached module renders it. */
function renders(
  walk: readonly string[],
  component: AppComponent,
  modules: ReadonlyMap<string, AppModule>,
) {
  return (
    walk.includes(moduleId(component.file)) &&
    walk.some((id) => modules.get(id)?.renders.has(component.name))
  );
}

interface AppInputs {
  components: readonly AppComponent[];
  /** Story file → the modules it imports. */
  imports: ReadonlyMap<string, ReadonlySet<string>>;
  /** The app's modules, for the walk from its story files (see `appModules`). */
  modules?: ReadonlyMap<string, AppModule>;
  stories: readonly Story[];
  tiled: ReadonlySet<string>;
  baselined: ReadonlySet<string>;
  boards?: Boards;
  routes?: NonNullable<
    Extract<Workspace['dimensions']['visual'], { state: 'measured' }>['routes']
  >;
}

/** An app: its components by the stories rendering them, its screen stories, its routes. */
export function appVisual(appPath: string, inputs: AppInputs) {
  const { stories, tiled, baselined } = inputs;
  const modules = inputs.modules ?? new Map<string, AppModule>();
  const walks = new Map(
    [...new Set(stories.map((s) => s.file))]
      .filter((file) => file.startsWith(`${appPath}/`))
      .map((file) => [file, reached(appPath, file, modules)]),
  );
  const judged = inputs.components.map((component) => {
    const id = moduleId(component.file);
    const files = new Set([
      ...[...inputs.imports].filter(([, t]) => t.has(id)).map(([file]) => file),
      ...[...walks]
        .filter(([, walk]) => renders(walk, component, modules))
        .map(([file]) => file),
    ]);
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
    inventory: screens.map((s) =>
      inventoryItem(
        s.id,
        'screens',
        [s],
        judge([s], tiled, baselined),
        inputs.boards ?? new Map(),
      ),
    ),
  };
  return {
    value,
    unstoried: unique(judged.filter((j) => !j.storied).map((j) => j.name)),
  };
}
