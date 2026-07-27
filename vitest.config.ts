import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Mirrors the tsconfig `@/*` → `./src/*` path alias so test imports match app imports.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Astro provides this virtual module at build/runtime; vitest can't resolve it, so stub it.
      "astro:env/server": fileURLToPath(new URL("./src/test/astro-env-server.stub.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // The CI review agent is a zero-dependency .mjs under a dot-directory, but its pure logic is
    // covered by the same gate as the rest of the repo.
    include: ["src/**/*.test.ts", ".github/actions/ai-review/*.test.mjs"],
  },
});
