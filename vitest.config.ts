import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    // Tests cover server and library logic only, so plain Node is enough.
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
