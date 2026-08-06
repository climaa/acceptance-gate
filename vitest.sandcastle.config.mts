import { defineConfig } from "vitest/config";

// Hermetic suite for the orchestrator's own contracts (prompt rules,
// merge-flow, model-override grammar). Run: pnpm test:sandcastle
export default defineConfig({
  test: {
    include: [".sandcastle/__tests__/**/*.test.ts"],
    environment: "node",
    globals: true,
  },
});
