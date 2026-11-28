import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["packages/core/src/index.ts"],
  format: "esm",
  platform: "node",
  target: "node24",
  dts: true,
});
