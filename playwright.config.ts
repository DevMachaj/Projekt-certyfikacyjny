import { defineConfig, devices } from "@playwright/test";

// Where the authenticated session lives. Written by e2e/auth.setup.ts on every run and
// gitignored (.gitignore: `playwright/.auth/`) — it holds a real session cookie.
export const STORAGE_STATE = "playwright/.auth/user.json";

export const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:4321";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    // Runs first and produces STORAGE_STATE. Deliberately carries no `storageState` of
    // its own — it is the thing that creates it.
    {
      name: "setup",
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: STORAGE_STATE },
      dependencies: ["setup"],
    },
  ],
  // Without this the whole suite fails with net::ERR_CONNECTION_REFUSED unless someone
  // remembered to run `npm run dev` in another terminal first.
  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
