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
  // addon-docs: autodocs (`tags: ['autodocs']` in preview.ts) plus the four
  // hand-written docs pages under src/docs. addon-a11y: axe in the panel, an
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
} as StorybookConfig & {
  options: { mdxPluginOptions: { mdxCompileOptions: { remarkPlugins: unknown[] } } };
};

export default config;
