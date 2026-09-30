import { defineConfig } from "vitest/config";

// Two projects: pure logic (`*.test.ts`, node) and components (`*.test.tsx`, jsdom).
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    // jsdom workers are memory-hungry; on a 16 GB machine the default pool crashed (exit 134 / 0xC0000409).
    maxWorkers: 2,
    exclude: ["**/node_modules/**", "**/.next/**", "e2e/**"],
    projects: [
      { extends: true, test: { name: "unit", environment: "node", include: ["**/*.test.ts"] } },
      {
        extends: true,
        test: { name: "dom", environment: "jsdom", include: ["**/*.test.tsx"], setupFiles: ["./vitest.setup.dom.ts"] },
      },
    ],
  },
});
