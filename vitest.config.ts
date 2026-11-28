import { defineConfig } from "vitest/config";

const player = new URL("./apps/player/", import.meta.url).pathname;

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "core",
          include: ["packages/core/src/**/*.test.ts", "packages/core/test/**/*.test.ts"],
        },
      },
      {
        // The player's "@/..." imports, as in apps/player/tsconfig.json.
        resolve: { alias: [{ find: /^@\//, replacement: player }] },
        test: {
          name: "player",
          include: ["apps/player/**/*.test.ts"],
          exclude: ["**/node_modules/**"],
        },
      },
    ],
  },
});
