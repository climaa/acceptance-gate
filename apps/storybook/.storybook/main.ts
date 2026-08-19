import type { StorybookConfig } from '@storybook/nextjs-vite';
import remarkGfm from 'remark-gfm';

const config: StorybookConfig = {
  // Resolved against this directory, not the workspace root: three levels up is
  // the repo. The design system's stories, then this app's own docs pages.
  //
  // There is deliberately no glob for app-composition stories, and the reason is
  // not taste. A story outside the design system does not merely go uncaptured —
  // it takes the whole gate down. The differ places a baseline by `importPath`:
  // `tierOf` (@gate/visual-diff/policy) reads the tier out of
  // `packages/ui/src/<tier>/` and returns `null` for anything else, and
  // `variantsOf` (storybook-index.mjs) throws `IndexError` rather than file a
  // shot under a layer it is not in. `commands.mjs` maps that to `EXIT.broken`,
  // so one `.stories.tsx` under `apps/` reports every committed variant as
  // unverified, for a reason unrelated to whoever added it.
  //
  // This glob used to read `../src/**/*.stories.tsx`, inviting exactly that. The
  // directory was empty, so the invitation had never been accepted.
  //
  // The `.mdx` glob is safe where a `.stories.tsx` one is not: docs entries are
  // indexed as `type: 'docs'` and `planCaptures` drops them before any tier is
  // asked for. `corpus-globs.test.mjs` is the tripwire, and it fails in `test`
  // rather than leaving this to a bare exit 2 in the differ.
  stories: ['../../../packages/ui/src/**/*.stories.tsx', '../src/**/*.mdx'],
  framework: '@storybook/nextjs-vite',
  // The design boards System Design embeds. A plain <img src="/designs/..."> in
  // an MDX doc, not a JS import: an ES import of a .png inside an MDX-compiled
  // module doesn't get Vite's asset-URL rewrite applied here — it resolves to
  // the raw module namespace object instead of a string, `?url` included.
  // staticDirs sidesteps that pipeline entirely.
  staticDirs: [{ from: '../../../designs/exports', to: '/designs' }],
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
  // RSC pipeline the consuming apps need (apps/blog, apps/visual-diff-ui); this
  // plain Rollup build has no RSC concept, drops the directive, and renders them
  // as client components either way — the drop is correct, not a bug. Rollup
  // still emits two warnings per module (the directive itself, and a sourcemap
  // warning from trying to locate it), so both are silenced by module id rather
  // than by message text, which would also catch an unrelated future warning
  // that happens to mention the same words. Scoped to the package and not to a
  // filename deliberately: the predicate this replaced named ThemeToggle.tsx
  // outright, and went silently stale the day a second client atom landed.
  viteFinal: async (viteConfig) => {
    const previousOnwarn = viteConfig.build?.rollupOptions?.onwarn;

    return {
      ...viteConfig,
      build: {
        ...viteConfig.build,
        rollupOptions: {
          ...viteConfig.build?.rollupOptions,
          onwarn(warning, warn) {
            const fromDesignSystemDirective =
              warning.id?.includes('/packages/ui/src/') &&
              (warning.code === 'MODULE_LEVEL_DIRECTIVE' ||
                warning.code === 'SOURCEMAP_ERROR');

            if (fromDesignSystemDirective) return;

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
