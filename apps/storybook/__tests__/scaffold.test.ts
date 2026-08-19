import * as fs from 'node:fs';
import * as path from 'node:path';
// Imported explicitly rather than relying on `globals: true` — the same reason the
// blog's suites give: tsconfig includes this file, so tsc typechecks it.
import { tierOf } from '@gate/visual-diff/policy';
import { describe, expect, it } from 'vitest';
import config from '../.storybook/main';

/**
 * The scaffold's cross-file invariants. Nothing here re-states a setting the
 * config already makes; every case pins two files that must agree and would
 * otherwise drift silently — a story glob against the directory it points at, a
 * dependency range against the app it was copied from, the build's output
 * directory against the three files that name it.
 */

const STORYBOOK_DIR = path.resolve(import.meta.dirname, '..');
const CONFIG_DIR = path.join(STORYBOOK_DIR, '.storybook');
const REPO_ROOT = path.resolve(STORYBOOK_DIR, '..', '..');

const readJson = (...segments: string[]) =>
  JSON.parse(fs.readFileSync(path.join(REPO_ROOT, ...segments), 'utf8'));

const manifest = readJson('apps', 'storybook', 'package.json');
const blogManifest = readJson('apps', 'blog', 'package.json');
const uiManifest = readJson('packages', 'ui', 'package.json');
const turbo = readJson('turbo.json');

/** `stories` also accepts directory objects; both entries here are plain globs. */
const storyGlobs = config.stories as string[];

/** Story globs are resolved by Storybook against the config directory, not the
 *  workspace root — one `../` too few silently matches nothing forever. */
const globRoot = (glob: string) =>
  path.resolve(CONFIG_DIR, glob.slice(0, glob.indexOf('*')));

describe('story globs', () => {
  it.each(storyGlobs)('%s points at a real directory', (glob) => {
    const root = globRoot(glob);

    const found = fs.existsSync(root) && fs.statSync(root).isDirectory();

    expect(found).toBe(true);
  });

  it('collects the design system from packages/ui', () => {
    const roots = storyGlobs.map(globRoot);

    expect(roots).toContain(path.join(REPO_ROOT, 'packages', 'ui', 'src'));
  });
});

/**
 * Where a story is allowed to live, and why the answer is not "anywhere
 * Storybook indexes it".
 *
 * The differ files a baseline under the tier it reads out of the story's
 * `importPath`. `tierOf` returns `null` for a path outside
 * `packages/ui/src/<tier>/`, and `variantsOf` throws `IndexError` rather than
 * shoot it under a layer it is not in — which `commands.mjs` maps to
 * `EXIT.broken`. So a single `.stories.tsx` glob pointing anywhere else does not
 * cost that story its baseline; it costs the run its verdict, and every
 * committed variant reports unverified.
 *
 * That failure is real but it lands in the wrong place: in the visual-diff job,
 * as exit 2, with a message about `index.json`. These cases move it into `test`,
 * where it names the offending glob and fails in a required check.
 *
 * The `.mdx` glob is deliberately exempt and not an oversight: docs are indexed
 * as `type: 'docs'` and `planCaptures` drops them before any tier is asked for.
 */
describe('the corpus boundary', () => {
  const CORPUS = path.join(REPO_ROOT, 'packages', 'ui', 'src');
  const storyModuleGlobs = storyGlobs.filter((glob) => glob.endsWith('.stories.tsx'));

  // Without this, every `it.each` below passes on an empty list the day the
  // suffix changes — approving silence instead of checking anything.
  it('finds story globs at all', () => {
    expect(storyModuleGlobs.length).toBeGreaterThan(0);
  });

  it.each(storyModuleGlobs)('%s resolves inside the tiered corpus', (glob) => {
    expect(globRoot(glob).startsWith(CORPUS)).toBe(true);
  });

  // Asserted against the differ rather than restated here. The rule belongs to
  // `tierOf`; if it ever stops refusing a path outside the corpus, this case
  // says so, instead of guarding a hazard that no longer exists.
  it('is the boundary tierOf enforces', () => {
    expect(tierOf('packages/ui/src/atoms/Badge/Badge.stories.tsx')).toBe('atoms');
    expect(tierOf('apps/storybook/src/RunPanel.stories.tsx')).toBeNull();
  });

  // Exact equality, not a `toContain`: the point is that nothing but docs comes
  // from this directory, which a containment check would not notice.
  it('collects docs, and only docs, from this app’s own src', () => {
    const own = storyGlobs.filter(
      (glob) => globRoot(glob) === path.join(STORYBOOK_DIR, 'src'),
    );

    expect(own).toEqual(['../src/**/*.mdx']);
  });
});

describe('the framework’s React and Next', () => {
  // The framework needs both present. A second range here would let Storybook
  // render a different Next than the one the blog ships.
  it.each(['next', 'react', 'react-dom'])('%s is the range apps/blog pins', (name) => {
    const ours = manifest.dependencies[name];

    expect(ours).toBe(blogManifest.dependencies[name]);
  });
});

describe('vite', () => {
  // This app is the only workspace that names vite outright — the framework needs
  // it — but vitest resolves the same instance for every other suite. Letting a
  // second major in makes apps/blog's `esbuild: { jsx: 'automatic' }` a no-op
  // (vite 8 transforms with oxc), and its whole suite fails to parse JSX.
  it('resolves to a single version across the monorepo', () => {
    const lockfile = fs.readFileSync(path.join(REPO_ROOT, 'pnpm-lock.yaml'), 'utf8');

    const versions = [...lockfile.matchAll(/^ {2}vite@([\d.]+):$/gm)].map(
      ([, version]) => version,
    );

    expect(versions).toHaveLength(1);
  });
});

describe('the design system stylesheet', () => {
  const preview = fs.readFileSync(path.join(CONFIG_DIR, 'preview.tsx'), 'utf8');

  it('is imported once, so every story renders against the real tokens', () => {
    const imports = preview.match(/@gate\/ui\/styles\.css/g) ?? [];

    expect(imports).toHaveLength(1);
  });

  it('is a subpath @gate/ui actually exports', () => {
    const subpath = './styles.css';

    expect(Object.keys(uiManifest.exports)).toContain(subpath);
  });
});

describe('the build artifact', () => {
  // Everything below is checked against the path the build script itself names,
  // so renaming the directory reds every file that has not followed it.
  const outputDir = manifest.scripts.build.match(/--output-dir (\S+)/)?.[1];

  it('has a directory the build script names outright', () => {
    expect(outputDir).toBeDefined();
  });

  it('is cached by turbo', () => {
    expect(turbo.tasks.build.outputs).toContain(`${outputDir}/**`);
  });

  // Prettier's glob reaches the emitted .json and .css; git would carry the whole
  // tree. Neither tool reads the other's ignore file, so both have to name it.
  it.each(['.gitignore', '.prettierignore'])('is ignored by %s', (file) => {
    const lines = fs.readFileSync(path.join(REPO_ROOT, file), 'utf8').split('\n');

    expect(lines.map((line) => line.trim())).toContain(`${outputDir}/`);
  });
});

describe('the story-test harness', () => {
  // Deliberately absent: every story already renders in real Chromium under the
  // differ, so a third browser harness would add CI minutes and no claim. Delete
  // this case with the decision, never around it.
  it.each(['@storybook/test-runner', '@storybook/addon-vitest'])(
    '%s is not a dependency',
    (name) => {
      const declared = { ...manifest.dependencies, ...manifest.devDependencies };

      expect(declared).not.toHaveProperty(name);
    },
  );
});
