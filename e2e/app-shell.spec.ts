import { test, expect } from "@playwright/test";

// S-11 (context/changes/app-shell-nav/plan.md): a persistent sidebar exposes Dashboard / Produkty
// / Plan zatowarowania on every authenticated page, and the weekly restocking plan now lives on
// its own /plan route — moved OFF the dashboard. This spec locks the nav and that relocation.
//
// Authenticated via the project-level storageState (playwright.config.ts). Role/label locators and
// wait-on-state only (never waitForTimeout), per CLAUDE.md. The plan's generate button
// ("Generuj plan") is the stable accessible name that proves where the plan renders.

test.describe("S-11: app shell nav + plan relocation", () => {
  test("sidebar exposes the three destinations and routes to /plan", async ({ page }) => {
    await page.goto("/dashboard");

    // The persistent sidebar nav — three links, located by role + accessible name.
    await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Produkty" })).toBeVisible();
    const planNav = page.getByRole("link", { name: "Plan zatowarowania" });
    await expect(planNav).toBeVisible();

    // Relocation proof: the plan generator is no longer on the dashboard.
    await expect(page.getByRole("button", { name: "Generuj plan" })).toHaveCount(0);

    // Navigating via the nav lands on /plan with the plan heading + the generator control.
    await planNav.click();
    await page.waitForURL("**/plan");
    await expect(page.getByRole("heading", { name: "Plan zatowarowania" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Generuj plan" })).toBeVisible();
  });

  test("dashboard heading still renders inside the shell", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  });
});
