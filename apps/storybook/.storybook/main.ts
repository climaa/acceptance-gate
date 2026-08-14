import type { StorybookConfig } from '@storybook/nextjs-vite';
import remarkGfm from 'remark-gfm';

const config: StorybookConfig = {
  // Resolved against this directory, not the workspace root: three levels up is
  // the repo. The design system first, then the compositions that belong to the
  // app rather than to the package, then this app's own docs pages.
  stories: [
    '../../../packages/ui/src/**/*.stories.tsx',
    '../src/**/*.stories.tsx',
    '../src/**/*.mdx',
  ],
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
  // ThemeToggle.tsx's `'use client'` is for Next.js/webpack's RSC pipeline (the
  // blog is what needs the boundary); this plain Rollup build has no RSC concept,
  // drops the directive, and renders the component as a client component either
  // way — the drop is correct, not a bug. Rollup still emits two warnings for it
  // (the directive itself, and a sourcemap warning from trying to locate it), so
  // both are silenced by module id rather than by message text, which would also
  // catch an unrelated future warning that happens to mention the same words.
  viteFinal: async (viteConfig) => {
    const previousOnwarn = viteConfig.build?.rollupOptions?.onwarn;

    return {
      ...viteConfig,
      build: {
        ...viteConfig.build,
        rollupOptions: {
          ...viteConfig.build?.rollupOptions,
          onwarn(warning, warn) {
            const fromThemeToggleDirective =
              warning.id?.endsWith('ThemeToggle.tsx') &&
              (warning.code === 'MODULE_LEVEL_DIRECTIVE' ||
                warning.code === 'SOURCEMAP_ERROR');

            if (fromThemeToggleDirective) return;

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
