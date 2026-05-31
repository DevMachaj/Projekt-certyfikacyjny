import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Mirrors the tsconfig `@/*` → `./src/*` path alias so test imports match app imports.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
