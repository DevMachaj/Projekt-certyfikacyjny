import { test, expect } from "@playwright/test";

// Risk R4 (context/foundation/test-plan.md): a request with no session — or a
// cleared / expired / tampered session — to a protected route must be redirected
// to /auth/signin and must NOT render protected data.
//
// Real boundaries under test (nothing mocked): Supabase auth + the
// src/middleware.ts route guard (local getClaims JWT verification, with the
// getUser fallback) + the redirect. These are exactly the integration points
// R4 names, including the recent local-JWT getClaims middleware change.
//
// Modeled on e2e/seed.spec.ts: role-based locators, wait-on-state (never time).

// The protected routes guarded in src/middleware.ts, each with the heading that
// only renders once authenticated — so we can assert protected data is absent.
const PROTECTED_ROUTES = [
  { path: "/dashboard", protectedHeading: "Dashboard" },
  { path: "/products", protectedHeading: "Products" },
  { path: "/account", protectedHeading: "Account" },
  { path: "/plan", protectedHeading: "Plan zatowarowania" },
];

test.describe("R4: protected routes reject unauthenticated access", () => {
  // Override the project-level authenticated storageState (playwright.config.ts) —
  // every test in this block must run with NO session.
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const { path, protectedHeading } of PROTECTED_ROUTES) {
    test(`no session: ${path} redirects to sign-in and renders no protected data`, async ({ page }) => {
      // Hit the protected route with no auth cookie at all.
      await page.goto(path);

      // The middleware must redirect to the sign-in page (wait on URL state).
      await page.waitForURL("**/auth/signin");
      await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

      // And the protected page's own content must never have rendered — this is
      // the half of R4 that a bare redirect check would miss.
      await expect(page.getByRole("heading", { name: protectedHeading })).toBeHidden();
    });
  }

  test("tampered/expired session: an unverifiable token does not grant access", async ({ page, context }) => {
    // A session cookie whose JWT cannot be verified stands in for an expired or
    // tampered token. getClaims() rejects it locally and the getUser() fallback
    // resolves no user, so the guard must still redirect. (Cookie name is the
    // local Supabase project's — this suite runs against localhost dev.)
    await context.addCookies([
      {
        name: "sb-127-auth-token",
        value: "base64-this-is-not-a-valid-jwt",
        domain: "localhost",
        path: "/",
      },
    ]);

    await page.goto("/dashboard");

    await page.waitForURL("**/auth/signin");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeHidden();
  });
});
