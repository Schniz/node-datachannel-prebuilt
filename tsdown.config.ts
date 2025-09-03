import { defineConfig } from "tsdown";

export default defineConfig({
  entry: "./datachannels.js",
  outDir: "./packages/prebuilt/types",
  dts: {
    emitDtsOnly: true,
    resolve: true,
  },
});
