import { defineConfig } from "vitest/config";

// Two projects: pure logic (`*.test.ts`, node) and components (`*.test.tsx`, jsdom).
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    // jsdom workers are memory-hungry: 2 on the old 16 GB machine (it crashed with more); 6 on the 48 GB server.
    maxWorkers: 6,
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
