import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 180000,
    pool: "forks",
  },
});
