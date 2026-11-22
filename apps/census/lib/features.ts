/**
 * Which deployed app each acceptance feature visits.
 *
 * Kept by hand on purpose. The suite has no per-app project and its step files
 * reach the console by absolute URL and the blog by a relative one, so nothing in
 * a `.feature` says which app it drives. A tag would say it, but a `.feature`
 * file is a product requirement and only its owner edits one. So the map lives
 * here, and a feature it does not name fails the measure step rather than going
 * uncounted: the census test suite reads `apps/e2e/features/` and refuses an
 * unmapped name, and the validator refuses a measurement that lists one.
 *
 * Keys are file names without `.feature`, unique across `acceptance/` and
 * `local/` (the suite test checks it).
 */

/** Every deployed app, and the workspace it is built from. */
export const APP_WORKSPACES = {
  blog: 'apps/blog',
  console: 'apps/visual-diff-ui',
  manual: 'apps/manual',
  storybook: 'apps/storybook',
  census: 'apps/census',
} as const;

export type App = keyof typeof APP_WORKSPACES;

export const FEATURE_APPS: Readonly<Record<string, App>> = {
  a11y: 'blog',
  about: 'blog',
  blog: 'blog',
  'changelog-comments': 'blog',
  'link-preview': 'blog',
  smoke: 'blog',
  'visual-diff-a11y': 'console',
  'visual-diff-console': 'console',
  'visual-diff-design': 'console',
  'visual-diff-report': 'console',
  'visual-diff-sample': 'console',
  'visual-diff-share': 'console',
  'visual-diff-shot': 'console',
  'visual-diff-tokens': 'console',
  // `features/local/`: run on a machine with a data directory, never in the gate.
  // Counted apart from the acceptance suite, so never what makes an app visited.
  'blog-content': 'blog',
  'visual-diff-flow': 'console',
};

/** The features under `features/local/`, which never count towards a visit. */
export const LOCAL_FEATURES: ReadonlySet<string> = new Set([
  'blog-content',
  'visual-diff-flow',
]);

/** `acceptance/visual-diff-shot.feature` → `visual-diff-shot`. */
export function featureName(file: string): string {
  const base = String(file.split('/').at(-1));
  return base.endsWith('.feature') ? base.slice(0, -'.feature'.length) : base;
}

/** The names the map does not know, in the order given. */
export function unmappedFeatures(names: readonly string[]): string[] {
  return names.filter((name) => !Object.hasOwn(FEATURE_APPS, name));
}

/** The workspace path a feature's app is built from, or `undefined` if unmapped. */
export function featureWorkspace(name: string): string | undefined {
  const app = Object.hasOwn(FEATURE_APPS, name) ? FEATURE_APPS[name] : undefined;
  return app ? APP_WORKSPACES[app] : undefined;
}
