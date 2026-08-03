import { test as setup, expect, type Page } from "@playwright/test";
import { BASE_URL, STORAGE_STATE } from "../playwright.config";

// Produces the authenticated session every spec with `storageState` depends on.
//
// This used to be a hand-made playwright/.auth/user.json living on exactly one machine
// (`playwright/.auth/` is gitignored) and never regenerated — so a fresh clone failed with
// ENOENT and an aged checkout failed once its access token expired. Regenerating it on every
// run makes the suite reproducible instead of dependent on one laptop's leftover file.
//
// Credentials default to a shared local E2E user, created on first run. Override for a
// non-local target (see .env.example).
const EMAIL = process.env.E2E_EMAIL ?? "e2e@example.com";
const PASSWORD = process.env.E2E_PASSWORD ?? "e2e-local-password";

// Where a successful sign-in ends up: both auth handlers redirect to "/", and "/" forwards an
// authenticated visitor to /dashboard. Anything else — /auth/* with an ?error=, or no redirect
// at all — means we are not authenticated.
const AUTHENTICATED_PATH = "/dashboard";

// Hit the endpoints the forms POST to rather than filling the forms: those pages are React
// islands, and filling a controlled input before hydration races the hydration reset. Same
// endpoint, same session cookie — and it lands in this context's cookie jar, which is what
// storageState serializes.
async function submitCredentials(page: Page, endpoint: string) {
  const response = await page.request.post(endpoint, {
    // Astro 6 rejects form POSTs whose origin it cannot verify ("Cross-site POST form
    // submissions are forbidden", 403). A browser sends this header on a real form submit,
    // so a request that stands in for one has to send it too.
    headers: { Origin: BASE_URL },
    form: { email: EMAIL, password: PASSWORD, confirmPassword: PASSWORD },
  });
  return { landedOn: new URL(response.url()).pathname, status: response.status() };
}

setup("authenticate", async ({ page }) => {
  let result = await submitCredentials(page, "/api/auth/signin");

  // First run against a fresh database — the shared E2E user does not exist yet.
  if (result.landedOn !== AUTHENTICATED_PATH) {
    result = await submitCredentials(page, "/api/auth/signup");
  }

  expect(
    result.landedOn,
    `could not authenticate ${EMAIL}: the POST ended on ${result.landedOn} with HTTP ${result.status}`,
  ).toBe(AUTHENTICATED_PATH);

  // Prove the cookie actually authenticates a page load before freezing it. A saved-but-dead
  // session is the failure this file exists to prevent, and it stays silent until specs fail.
  await page.goto(AUTHENTICATED_PATH);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  await page.context().storageState({ path: STORAGE_STATE });
});
