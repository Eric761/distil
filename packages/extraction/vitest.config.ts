import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/__tests__/**/*.test.ts"],
    testTimeout: 20_000,
  },
  resolve: {
    // Vite resolve.extensionAlias — required for NodeNext `.js` imports in tests.
    extensionAlias: {
      ".js": [".ts", ".js"],
    },
  },
});
