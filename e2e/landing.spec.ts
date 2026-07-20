import { test, expect } from "@playwright/test";

// S-10 (context/changes/landing-page/plan.md): the "/" route is a public landing page for
// anonymous visitors, but authenticated visitors must be redirected to /dashboard before any
// landing markup renders. "/" is deliberately NOT in PROTECTED_ROUTES — the redirect is a
// page-level session check in index.astro, not a middleware guard. This spec locks both halves
// of that routing contract, the slice's named trap.
//
// Real boundaries under test (nothing mocked): Supabase auth + src/middleware.ts (which populates
// Astro.locals.user) + the page-level redirect. Modeled on e2e/protected-routes-auth.spec.ts:
// role-based locators, wait-on-state (never waitForTimeout).

// A stable substring of the hero <h1> ("Wiedz, co zamówić\nw tym tygodniu" — the <br> normalizes
// to whitespace in the accessible name). Kept byte-stable; the hero copy must not drift from it.
const HERO_HEADING = /Wiedz, co zamówić/;

test.describe("S-10: landing page routing contract", () => {
  test.describe("anonymous visitor", () => {
    // Override the project-level authenticated storageState (playwright.config.ts) — run with no session.
    test.use({ storageState: { cookies: [], origins: [] } });

    test("sees the public landing at / with no redirect", async ({ page }) => {
      await page.goto("/");

      // The hero heading proves the landing rendered, exposed by role (accessibility tree).
      await expect(page.getByRole("heading", { name: HERO_HEADING })).toBeVisible();

      // And "/" must stay "/" — an anonymous visitor is never redirected off the landing.
      expect(new URL(page.url()).pathname).toBe("/");
    });
  });

  test.describe("authenticated visitor", () => {
    // Uses the project-level authenticated storageState from playwright.config.ts (a live session).

    test("is redirected from / to /dashboard", async ({ page }) => {
      await page.goto("/");

      // The page-level guard must send the authenticated visitor to the dashboard (wait on URL state).
      await page.waitForURL("**/dashboard");
      await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

      // The marketing hero must never have rendered for the logged-in owner.
      await expect(page.getByRole("heading", { name: HERO_HEADING })).toBeHidden();
    });
  });
});
