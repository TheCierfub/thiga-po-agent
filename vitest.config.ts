import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, ".") },
  },
  test: {
    include: ["core/**/*.test.ts", "components/etai/linear-badge.test.tsx", "components/etai/magic-link-sent.test.tsx"],
    environment: "node",
  },
});
