import type { StorybookConfig } from '@storybook/nextjs-vite';

const config: StorybookConfig = {
  // Resolved against this directory, not the workspace root: three levels up is
  // the repo. The design system first, then the compositions that belong to the
  // app rather than to the package.
  stories: ['../../../packages/ui/src/**/*.stories.tsx', '../src/**/*.stories.tsx'],
  framework: '@storybook/nextjs-vite',
  // The build runs on every PR and, from Wave 4, inside the differ's container.
  // A per-build call to an external endpoint is a network dependency the gate
  // gains nothing from.
  core: { disableTelemetry: true },
};

export default config;
