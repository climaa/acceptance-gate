import type { StorybookConfig } from '@storybook/nextjs-vite';

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
  // addon-docs: autodocs (`tags: ['autodocs']` in preview.ts) plus the three
  // hand-written docs pages under src/docs. addon-a11y: axe in the panel, an
  // authoring-time check — the headless per-variant pass that gates the build
  // is Wave 4's, not this addon's.
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y'],
  // The build runs on every PR and, from Wave 4, inside the differ's container.
  // A per-build call to an external endpoint is a network dependency the gate
  // gains nothing from.
  core: { disableTelemetry: true },
};

export default config;
