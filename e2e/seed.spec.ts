import { test, expect } from "@playwright/test";

test("product persists after page reload", async ({ page }) => {
  const productName = `Test Product ${Date.now()}`;

  await page.goto("/products");

  // Click opener, then WAIT for the dialog to actually appear (handles
  // Astro island hydration — the button renders before React attaches onClick).
  const dialog = page.getByRole("dialog", { name: "Add product" });
  await expect(async () => {
    await page.getByRole("button", { name: "Add product" }).click();
    await expect(dialog).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15000 });

  await dialog.getByRole("textbox", { name: "Name" }).fill(productName);
  await dialog.getByRole("spinbutton", { name: "Stock quantity" }).fill("10");
  await dialog.getByRole("button", { name: "Add product" }).click();

  await expect(page.getByRole("link", { name: productName })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("link", { name: productName })).toBeVisible();

  await page.getByRole("button", { name: `Delete ${productName}` }).click();
});
