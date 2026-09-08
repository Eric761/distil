import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/__tests__/**/*.test.ts"],
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 10_000,
  },
  resolve: {
    // @ts-ignore Vite 5 resolve.extensionAlias — required for NodeNext `.js` imports in tests.
    extensionAlias: {
      ".js": [".ts", ".js"],
    },
  },
});
