import { defineConfig, mergeConfig } from 'vitest/config';

import { preset } from '../../vitest.shared.mjs';

// Unit tests for the suite's own support code. The scenarios themselves run
// under Playwright, never here — `include` names `support/` alone so vitest can
// never pick up a step file or a generated spec.
const config = defineConfig({
  test: { include: ['support/**/*.test.ts'], environment: 'node' },
});

export default mergeConfig(preset, config);
