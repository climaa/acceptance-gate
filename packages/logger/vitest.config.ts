import { defineConfig, mergeConfig } from 'vitest/config';

import { preset } from '../../vitest.shared.mjs';

const config = defineConfig({
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});

export default mergeConfig(preset, config);
