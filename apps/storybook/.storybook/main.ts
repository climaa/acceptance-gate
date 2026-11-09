import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { StorybookConfig } from '@storybook/nextjs-vite';
import type { PluginOption } from 'vite';
import remarkGfm from 'remark-gfm';

// The extension is explicit because Storybook loads this file with its own
// loader, which warns on an extensionless relative import (storybook.js.org
// FAQ, "extensionless imports in storybook/main.ts"); tsconfig.json allows it.
import { analyticsHead } from './analytics-head.ts';
import { linkPreviewHead } from './link-preview-head.ts';
import { projectName } from '../../visual-diff-ui/scripts/project-name.mjs';

/** The apps directory: every storied app's root sits under it. */
const APPS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The console, whose header names the project and whose board addresses are
 *  swapped for static files below. */
const CONSOLE_DIR = join(APPS_DIR, 'visual-diff-ui');

/** The manual, whose feature sources are swapped for raw imports below. */
const MANUAL_DIR = join(APPS_DIR, 'manual');

/** Each storied app's root. Every one maps `@/*` to itself in its tsconfig, which is
 *  why `@/…` is resolved by {@link appAlias} rather than by an alias entry. The
 *  same apps, in the same order, as the policy's `APP_ROOTS`. */
const STORIED_APPS = ['visual-diff-ui', 'blog', 'manual'].map((app) =>
  join(APPS_DIR, app),
);

/** Forward slashes whatever the platform: Vite hands ids over posix-style. */
const posix = (path: string) => path.replaceAll('\\', '/');

/**
 * Which app's root a `@/…` written in `importer` means, or `undefined` when the
 * importer belongs to no storied app.
 *
 * Getting it wrong is silent: the blog and the manual both carry a `lib/site` and
 * a `lib/share`, so a manual screen sent to the blog's root still builds, and
 * renders the other app's words. Exported for `__tests__/app-alias.test.ts`.
 */
export const appRootFor = (importer: string): string | undefined => {
  const path = posix(importer);

  return STORIED_APPS.find((root) => path.startsWith(`${posix(root)}/`));
};

/** The console's board addresses, swapped for the static files (design-urls.ts). */
const DESIGN_URLS = join(dirname(fileURLToPath(import.meta.url)), 'design-urls.ts');

/** The manual's feature sources, swapped for raw imports (manual-sources.ts). */
const MANUAL_SOURCES = join(dirname(fileURLToPath(import.meta.url)), 'manual-sources.ts');

/**
 * The app modules a story cannot load as they are, each swapped for a file beside
 * this config that answers the same exports in a browser:
 *
 * - the console's `@/lib/design-urls`: a board is served by a route with a query,
 *   which a static build cannot answer, so a screen reads the same files off
 *   `/designs` instead;
 * - the manual's `@/lib/sources`: it reads the published `.feature` files with
 *   `readFileSync`, so a screen imports the same files as text.
 */
const SWAPS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  [CONSOLE_DIR]: { '@/lib/design-urls': DESIGN_URLS },
  [MANUAL_DIR]: { '@/lib/sources': MANUAL_SOURCES },
};

/**
 * `@/lib/site` resolved against the app that wrote it. Vite's `resolve.alias` sees
 * the specifier alone, never who wrote it, and `@` is one key one target owns —
 * hence a plugin, at `pre`, ahead of Vite's own alias pass. Taken from trucutru,
 * whose four apps met the problem first.
 */
const appAlias = (): PluginOption => ({
  name: 'gate-app-alias',
  enforce: 'pre',
  resolveId(source, importer) {
    if (!source.startsWith('@/') || importer === undefined) return null;

    const root = appRootFor(importer);

    // Left to Vite, which fails naming the file that wrote it: better than a guess.
    if (root === undefined) return null;

    const swap = SWAPS[root]?.[source];
    if (swap !== undefined) return swap;

    // Handed back to Vite: picking `.tsx`, `.ts` or a directory index is its job.
    return this.resolve(join(root, source.slice(2)), importer, { skipSelf: true });
  },
});

/** The sample fixtures a screen's screenshots come from, served at the console's
 *  own shot routes: those routes take a path, so a static directory answers them
 *  byte for byte. Only what a screen story draws — the report it opens and the
 *  one set that ships shots. */
const SCREEN_REPORTS = ['main-2026-10-13__main-2026-09-17'];
const SCREEN_SETS = ['main-2026-08-30'];

const screenShots = [
  ...SCREEN_REPORTS.map((id) => ({
    from: `../../visual-diff-ui/fixtures/reports/${id}/shots`,
    to: `/api/shots/${id}`,
  })),
  ...SCREEN_SETS.map((label) => ({
    from: `../../visual-diff-ui/fixtures/sets/${label}`,
    to: `/api/sets/${label}/shots`,
  })),
];

/** The page the root redirect lands on, whose words a shared link previews with. */
const WELCOME_MDX = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'docs',
  'Welcome.mdx',
);

const config: StorybookConfig = {
  // Resolved against this directory, not the workspace root: three levels up is
  // the repo. The design system's stories, the console's screens, then this
  // app's own docs pages.
  //
  // A story glob goes only where `tierOf` (@gate/visual-diff/policy) can place
  // what it finds, and the reason is not taste. A story outside those roots does
  // not merely go uncaptured — it takes the whole gate down. The differ places a
  // baseline by `importPath`: `tierOf` reads the tier out of
  // `packages/ui/src/<tier>/`, calls a story under an `APP_ROOTS` directory a
  // `screens` story, and returns `null` for anything else; `variantsOf`
  // (storybook-index.mjs) throws `IndexError` rather than file a shot under a
  // layer it is not in, and `commands.mjs` maps that to `EXIT.broken`. So the
  // screens globs name each `APP_ROOTS` directory one by one, and no wider: a
  // glob over `apps/` would report every committed variant as unverified the
  // day an unlisted app grew a story.
  //
  // The `.mdx` glob is safe where a `.stories.tsx` one is not: docs entries are
  // indexed as `type: 'docs'` and `planCaptures` drops them before any tier is
  // asked for. `corpus-globs.test.mjs` is the tripwire, and it fails in `test`
  // rather than leaving this to a bare exit 2 in the differ.
  stories: [
    '../../../packages/ui/src/**/*.stories.tsx',
    '../../visual-diff-ui/app/**/*.stories.tsx',
    '../../blog/app/**/*.stories.tsx',
    '../../manual/app/**/*.stories.tsx',
    '../src/**/*.mdx',
  ],
  framework: '@storybook/nextjs-vite',
  // The design boards System Design embeds. A plain <img src="/designs/..."> in
  // an MDX doc, not a JS import: an ES import of a .png inside an MDX-compiled
  // module doesn't get Vite's asset-URL rewrite applied here — it resolves to
  // the raw module namespace object instead of a string, `?url` included.
  // staticDirs sidesteps that pipeline entirely.
  // A screen's shots ride the same mechanism, at the addresses the console's
  // components build (`lib/shots.ts`), so no story rewrites a URL.
  //
  // The blog's and the manual's screens ask for their own public files at the
  // addresses their apps serve them: the changelog control's animation, and the
  // manual's console captures. Only those two directories — the blog's
  // `public/images` would claim `/images` too, and none of its screens draws one.
  staticDirs: [
    { from: '../../../designs/exports', to: '/designs' },
    ...screenShots,
    { from: '../../blog/public/lottie', to: '/lottie' },
    { from: '../../manual/public/images', to: '/images' },
  ],
  // addon-docs: autodocs (`tags: ['autodocs']` in preview.ts) plus the thirteen
  // hand-written docs pages under src/docs, whose subdirectories mirror the
  // sidebar folders their <Meta title> puts them in. addon-a11y: axe in the panel, an
  // authoring-time check — the headless per-variant pass that runs in CI (see
  // the Visual Diff Workflow docs page) is `@gate/visual-diff`'s own, separate
  // from this addon and never blocking on its own.
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y'],
  // The build runs on every PR and, inside the differ's job, inside the pinned
  // Playwright container. A per-build call to an external endpoint is a network
  // dependency the gate gains nothing from.
  core: { disableTelemetry: true },
  // The page-view beacon, and the only thing this build ever loads from off-site
  // — which is why it sits next to the telemetry switch above rather than
  // anywhere else. It emits nothing at all unless `VERCEL_ENV` says production,
  // so the promise that line makes still holds locally, in CI and inside the
  // differ's container. Manager, never preview: analytics-head.ts argues that,
  // and the docs page (Docs/DevOps/Web Analytics) carries the rest.
  //
  // `head` is typed `string | undefined`: Storybook passes the head accumulated
  // so far, but the preset signature permits its absence. A bare template
  // literal type-checks against that and then writes the seven characters
  // "undefined" into the manager's <head>, where they render as page text.
  //
  // The link-preview tags ride the same head, on every build rather than only
  // production: they load nothing, and a preview build that shares them names
  // the published address, which is where the link should fold back to.
  // link-preview-head.ts says where the words come from.
  managerHead: (head) =>
    `${head ?? ''}${linkPreviewHead(readFileSync(WELCOME_MDX, 'utf8'))}${analyticsHead(process.env)}`,
  // GFM (tables, strikethrough, task lists) is not CommonMark — without this,
  // a pipe table in a docs page silently renders as one run-on paragraph of
  // literal pipe characters instead of a <table>, same failure mode the blog's
  // MDX pipeline had (apps/blog/lib/mdx.tsx) before it got the same plugin.
  // addon-docs's mdx-plugin reads this off `presets.apply('options', {})` —
  // Storybook resolves that hook from a field literally named `options` on
  // this config object, the same way `docs`/`core`/etc. resolve. Not part of
  // StorybookConfig's declared type (it predates the current typed surface),
  // hence the trailing cast rather than a typed field.
  options: {
    mdxPluginOptions: {
      mdxCompileOptions: {
        remarkPlugins: [remarkGfm],
      },
    },
  },
  // @gate/ui's client components carry `'use client'` for the Next.js/webpack
  // RSC pipeline the consuming apps need (apps/blog, apps/visual-diff-ui), and
  // so do the `next/dist` client modules `@storybook/nextjs-vite` pulls in.
  // This plain bundle has no RSC concept, drops the directive, and renders them
  // as client components either way — the drop is correct, not a bug. The
  // bundler still emits two warnings per module (the directive itself, and a
  // sourcemap warning from trying to locate it), so both are silenced by module
  // id rather than by message text, which would also catch an unrelated future
  // warning that happens to mention the same words. Scoped to the two sources
  // and not to a filename deliberately: the predicate this replaced named
  // ThemeToggle.tsx outright, and went silently stale the day a second client
  // atom landed.
  //
  // `rolldownOptions`, not `rollupOptions`: Vite 8 bundles with Rolldown, and
  // when both are set the deprecated `rollupOptions` alias loses — a hook put
  // there is never called. Vite 8.3.1 is where that started to show.
  //
  // A screen renders the console's client components, and those call Next's
  // `useRouter()`. Next 16.4 reads `parentRenderTree` off the LayoutRouterContext
  // the framework mounts, which `@storybook/nextjs-vite` 10.5–10.6 does not provide, so
  // `patches/@storybook__nextjs-vite@10.6.2.patch` adds it. The patch is keyed to
  // that exact version, so a bump leaves it unused, which pnpm refuses: the bump
  // has to carry it forward or, once a release mounts the field itself, drop it.
  //
  // `appAlias` gives each screen its own app's `@/…`. The storied apps'
  // `'use client'` modules warn as the design system's do, for the same reason,
  // so their trees join the silenced sources.
  viteFinal: async (viteConfig) => {
    const previousOnwarn = viteConfig.build?.rolldownOptions?.onwarn;

    return {
      ...viteConfig,
      // What the console's next.config.mjs inlines for its build, so a screen
      // story's header names the project the way the deployed console does.
      define: {
        ...viteConfig.define,
        'process.env.VISUAL_DIFF_PROJECT': JSON.stringify(
          projectName(join(CONSOLE_DIR, '..', '..')),
        ),
      },
      plugins: [...(viteConfig.plugins ?? []), appAlias()],
      build: {
        ...viteConfig.build,
        // Vite's 500 kB default is a budget for pages a visitor waits on. This
        // is an internal static tool, and its biggest chunks are lazy or
        // inherent: elk (mermaid's layout engine, loaded only by docs pages that
        // draw a diagram), Storybook's own preview runtime, axe. The limit sits
        // just above them, so the warning still fires when something new and
        // large lands.
        chunkSizeWarningLimit: 1600,
        rolldownOptions: {
          ...viteConfig.build?.rolldownOptions,
          onwarn(warning, warn) {
            const fromClientDirective =
              (warning.id?.includes('/packages/ui/src/') ||
                STORIED_APPS.some((root) => warning.id?.includes(`${posix(root)}/`)) ||
                warning.id?.includes('/node_modules/next/dist/')) &&
              (warning.code === 'MODULE_LEVEL_DIRECTIVE' ||
                warning.code === 'SOURCEMAP_ERROR');

            if (fromClientDirective) return;

            (previousOnwarn ?? warn)(warning, warn);
          },
        },
      },
    };
  },
} as StorybookConfig & {
  options: { mdxPluginOptions: { mdxCompileOptions: { remarkPlugins: unknown[] } } };
};

export default config;
