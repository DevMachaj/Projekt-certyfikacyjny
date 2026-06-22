# Account Deletion and Data Retention (S-07) Implementation Plan

## Overview

Let an authenticated owner permanently delete their account. Deletion is a **hard delete**: the API calls Supabase's Admin API (`auth.admin.deleteUser`) on the caller's own `auth.users` row, and the existing `ON DELETE CASCADE` foreign keys from F-01 remove all `products` and `sales_entries` automatically. No manual cascade logic is written. The deletion is fronted by a new `/account` page with a type-email-to-confirm danger zone, and the user's session is torn down and they are redirected to the landing page on success.

The retention policy for this slice is **immediate, irreversible hard delete** — there is no soft-delete window. This was the blocking product decision flagged in the roadmap (S-07 Unknown); it is now resolved.

## Current State Analysis

- **Cascade contract is already in place.** Both `products.user_id` (`supabase/migrations/20260530000001_create_products.sql:3`) and `sales_entries.user_id` (`supabase/migrations/20260530000002_create_sales_entries.sql:4`) declare `REFERENCES auth.users(id) ON DELETE CASCADE`. Deleting the `auth.users` row therefore wipes both tables directly — no application-level cascade is needed or wanted.
- **Single SSR client factory.** `src/lib/supabase.ts` exports one `createClient(headers, cookies)` using `@supabase/ssr`, returning `null` when `SUPABASE_URL`/`SUPABASE_KEY` are unset. There is no admin/service-role client yet. `@supabase/supabase-js@^2.99.1` is already a dependency, which provides the plain `createClient` and `auth.admin.deleteUser`.
- **Env schema.** `astro.config.mjs:17-23` declares `SUPABASE_URL`, `SUPABASE_KEY`, `ANTHROPIC_API_KEY`, each as `envField.string({ context: "server", access: "secret", optional: true })`, read through `astro:env/server`. No service-role key is declared.
- **Route guard.** `src/middleware.ts:4` holds `PROTECTED_ROUTES = ["/dashboard", "/products"]`; unauthenticated hits redirect to `/auth/signin`. No `/account` route exists.
- **Deletion dialog pattern.** `src/components/products/DeleteProductDialog.tsx` is a controlled modal (open driven by a non-null target, `pending`/`onConfirm`/`onCancel` props). `src/components/products/ProductCatalog.tsx:89-108` shows the fetch → read `{error}` → update-state → close idiom, with `readError()` (`ProductCatalog.tsx:20-28`) parsing the `{ error }` JSON contract.
- **API route convention.** `src/pages/api/products/[id].ts` shows the contract: `export const prerender = false`, 401 when `context.locals.user` is absent, 503 when `createClient` returns null, and try/catch returning `Response.json({ error }, { status })`. `src/pages/api/auth/signout.ts` shows the session teardown idiom (`supabase.auth.signOut()` then redirect).
- **Lessons constraint.** `context/foundation/lessons.md` requires every throw-capable Supabase call from an API route to be wrapped in try/catch and to return the `{ error }` JSON contract that `readError()` expects.

## Desired End State

A signed-in owner can visit `/account`, see their email and a danger zone, click "Delete account", type their email to enable the destructive button, confirm, and have their account plus all associated data permanently removed. Their session is cleared and they land on `/`. If the deletion fails (service-role key missing/invalid, or a Supabase error), they see an inline error and remain signed in with their data intact — no half-deleted state.

Verify by: signing in as a seeded user with products/sales entries, deleting the account, confirming (a) redirect to `/`, (b) the old session no longer authenticates, and (c) the user's `products` and `sales_entries` rows are gone from the database.

### Key Discoveries:

- `ON DELETE CASCADE` on both domain tables (`migrations/20260530000001_create_products.sql:3`, `20260530000002_create_sales_entries.sql:4`) makes auth-user deletion sufficient.
- `auth.admin.deleteUser(id)` requires a **service-role** client — the anon-key SSR client cannot call admin methods. The service-role key is a privileged secret and must be a Worker secret, never committed.
- `astro:env/server` secrets are `optional: true` in this project, so every consumer null-guards (`src/lib/supabase.ts:6`, `src/lib/services/restocking-summary.ts:56`). The admin factory must follow suit.
- The product delete dialog has no error-display affordance; the account dialog needs one (decision: errors keep the session, so the dialog must show them).

## What We're NOT Doing

- **No soft delete / retention window.** Deletion is immediate and irreversible. No `deleted_at` column, no scheduled purge job, no grace period.
- **No manual cascade.** We do not delete `products`/`sales_entries` rows in application code — the DB FKs do it.
- **No generalization of `DeleteProductDialog`.** We copy the pattern into a new `DeleteAccountDialog`; the shared product dialog is left untouched.
- **No data export / "download my data" feature.** Out of scope for this slice.
- **No account-settings surface beyond the danger zone** (no email change, password reset, profile fields). The `/account` page is danger-zone-only.
- **No admin/other-user deletion.** The route deletes only the caller's own id; no id is accepted from the client.
- **No `/goodbye` page.** Success redirects to the existing landing page `/`.

## Implementation Approach

Three independently verifiable phases, bottom-up so each rests on a verified foundation:

1. **Config + admin client** — declare the secret and add a null-guarded `createAdminClient()` factory. Pure plumbing; no behavior change, verifiable by build/typecheck/lint.
2. **API route + route guard** — `DELETE /api/account` re-derives the caller id from `getUser()`, deletes via the admin client, then signs out; `/account` is added to `PROTECTED_ROUTES`. Verifiable by HTTP status codes without any UI.
3. **UI** — a new `DeleteAccountDialog` island (type-email-to-confirm + inline error) and a danger-zone `/account` page wiring it, redirecting to `/` on success. Verifiable end-to-end through the browser.

## Critical Implementation Details

- **Deletion → sign-out ordering.** The admin `deleteUser` call uses the service-role client (no session). The session teardown uses the SSR cookie client. Delete first; only if it succeeds, call `signOut()` on the SSR client so the now-orphaned session cookie is cleared. If deletion fails, do **not** sign out — return the error and leave the session intact.
- **Two clients in one handler.** The route needs both: the SSR client (`createClient`) to read the session / `getUser()` and to `signOut()`, and the admin client (`createAdminClient`) to perform the privileged delete. Guard each for null independently (503 if either is unconfigured).
- **Service-role key is privileged.** It bypasses RLS. It is only ever used server-side inside this route's admin client and must never reach the browser bundle or be committed. Declared `access: "secret"` so Astro keeps it server-only.

## Phase 1: Service-role config + admin client factory

### Overview

Declare `SUPABASE_SERVICE_ROLE_KEY` and add a null-guarded admin client factory. No runtime behavior changes yet — this phase only makes the privileged client available.

### Changes Required:

#### 1. Env schema

**File**: `astro.config.mjs`

**Intent**: Make the service-role key a recognized server-only secret so it can be read via `astro:env/server`.

**Contract**: Add `SUPABASE_SERVICE_ROLE_KEY: envField.string({ context: "server", access: "secret", optional: true })` to the `env.schema` object, matching the three existing secret declarations exactly.

#### 2. Admin client factory

**File**: `src/lib/supabase.ts`

**Intent**: Provide a separate factory that returns a service-role Supabase client capable of calling `auth.admin.*`, kept distinct from the cookie-based SSR client.

**Contract**: New exported `createAdminClient()` (no args) that imports `createClient` from `@supabase/supabase-js` and reads `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` from `astro:env/server`. Returns `null` when either is unset (mirroring the existing factory's null-guard at `src/lib/supabase.ts:6`). Construct with session persistence disabled (no cookie integration — this is a stateless admin client). The existing `createClient` SSR factory is unchanged; import aliasing may be needed since both this file and `@supabase/supabase-js` use the name `createClient`.

#### 3. Secret documentation

**File**: `.env.example` (and `.dev.vars` is gitignored — document in `.env.example` only)

**Intent**: Tell developers the new secret exists and where it comes from, without committing a value.

**Contract**: Add a `SUPABASE_SERVICE_ROLE_KEY=` line with a short comment noting it is the Supabase project service-role key, server-only, and a Worker secret in production. No real value.

### Success Criteria:

#### Automated Verification:

- Build passes: `npm run build`
- Type checking / lint passes: `npm run lint`
- `SUPABASE_SERVICE_ROLE_KEY` appears in `astro.config.mjs` env schema and `.env.example`
- `createAdminClient` is exported from `src/lib/supabase.ts`

#### Manual Verification:

- With `SUPABASE_SERVICE_ROLE_KEY` unset, `createAdminClient()` returns `null` (no throw)
- The service-role key is not present anywhere in committed files (`git grep` for any literal key value returns nothing)

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 2.

---

## Phase 2: Delete-account API route + route guard

### Overview

Add the destructive endpoint and protect the `/account` route. The endpoint re-derives the caller's id from the session, hard-deletes via the admin client, then tears down the session — returning the `{ error }` JSON contract on any failure without signing out.

### Changes Required:

#### 1. Delete-account API route

**File**: `src/pages/api/account.ts` (new) — `DELETE /api/account`

**Intent**: Permanently delete the authenticated caller's account (and, via cascade, all their data), then clear their session. On failure, preserve the session and return a structured error.

**Contract**: `export const prerender = false`. Export `DELETE: APIRoute`. Flow:
1. 401 `{ error }` if `context.locals.user` is absent.
2. Create the SSR client (`createClient`) and the admin client (`createAdminClient`); 503 `{ error }` if either is `null` (service unconfigured).
3. Re-derive the caller id from `supabase.auth.getUser()` server-side (do **not** trust any client-supplied id); inspect the returned `{ data, error }` — 401 if `error` is non-null or no user resolves.
4. Call `adminClient.auth.admin.deleteUser(userId)` and **inspect the returned `{ error }` object** — supabase-js admin methods do not throw on API errors (an invalid service-role key returns a 401 in `error`, not an exception); they throw only on network failure. If the returned `error` is non-null, return 500 `{ error }` **without** signing out. Wrap the call in try/catch as well so a network throw also returns 500 `{ error }` without signing out. The success branch is reached **only** when `error` is null.
5. On success (error null), a successful delete is the **point of no return** — the account is irreversibly gone. Call `supabase.auth.signOut()` to clear the session cookies as a **best-effort** step: wrap it so any signOut error is swallowed/logged, never converted into a non-200 response. Always return `200` `{ ok: true }` once the delete succeeded (the island performs the redirect). A lingering cookie if signOut fails is harmless — the deleted user's token is inert and middleware's `getUser()` returns null on the next request.

All Supabase calls inspect their returned `{ error }` (not only try/catch) and are wrapped per `context/foundation/lessons.md`. Preserve the `{ error }` JSON shape `readError()` consumes.

#### 2. Route guard

**File**: `src/middleware.ts`

**Intent**: Require authentication to reach `/account`.

**Contract**: Add `"/account"` to the `PROTECTED_ROUTES` array (`src/middleware.ts:4`). No other middleware change.

### Success Criteria:

#### Automated Verification:

- Build passes: `npm run build`
- Lint passes: `npm run lint`
- `"/account"` is present in `PROTECTED_ROUTES`

#### Manual Verification:

- `DELETE /api/account` while signed out returns 401 with `{ error }`
- With the service-role key unset, an authenticated `DELETE /api/account` returns 503 with `{ error }` and the account is NOT deleted
- With everything configured, an authenticated `DELETE /api/account` returns 200, the user's `auth.users` row is gone, and their `products`/`sales_entries` rows are gone (cascade verified via a DB query)
- Visiting `/account` while signed out redirects to `/auth/signin`

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 3.

---

## Phase 3: DeleteAccountDialog island + /account page

### Overview

Build the user-facing surface: a copied-and-specialized delete dialog with type-email-to-confirm and inline error display, and a danger-zone-only `/account` page that wires it, redirecting to `/` on success.

### Changes Required:

#### 1. Delete-account dialog

**File**: `src/components/account/DeleteAccountDialog.tsx` (new)

**Intent**: A confirmation modal specialized for the irreversible account deletion — guarded by type-email-to-confirm, and able to display a server error inline (the product dialog cannot).

**Contract**: Copy the structure of `src/components/products/DeleteProductDialog.tsx` (shadcn `Dialog`, `TriangleAlert`, destructive confirm button, `pending` disabling). Props: `open: boolean`, `email: string`, `pending: boolean`, `error: string | null`, `onConfirm: () => void`, `onCancel: () => void`. Internal controlled text input; the confirm button is disabled until the typed value exactly equals `email` (case-sensitive match of the user's own email) or `pending` is true. Render `error` inline when non-null (red banner consistent with `ProductCatalog`'s list-error styling). Do not import or modify `DeleteProductDialog`.

#### 2. Account danger-zone island

**File**: `src/components/account/AccountDangerZone.tsx` (new)

**Intent**: Own the delete interaction state and the fetch to `DELETE /api/account`, mirroring `ProductCatalog`'s mutation idiom.

**Contract**: Client island, props `{ email: string }`. Renders a "Delete account" trigger button that opens `DeleteAccountDialog`. `handleDelete` does `fetch("/api/account", { method: "DELETE" })`; on `!res.ok` reads `await readError(res, fallback)` and surfaces it as the dialog `error` (session preserved, dialog stays open); on success sets `window.location.href = "/"`. Reuse the `readError` helper pattern from `ProductCatalog.tsx:20-28` (extract to a shared util or inline-copy — implementer's call, keep consistent with existing style). Manages `open`/`pending`/`error` state.

#### 3. Account page

**File**: `src/pages/account.astro` (new)

**Intent**: A danger-zone-only account page showing the signed-in email and the delete control.

**Contract**: Mirror `src/pages/dashboard.astro` frontmatter/layout conventions (`Layout`, read `Astro.locals.user`). Middleware guarantees `user` is present. Note that `user.email` is typed `string | undefined` (Supabase), and `lint` runs type-checked rules — resolve it to a definite string in the frontmatter before passing it down (guard/fallback, consistent with the existing `user?.email` usage at `dashboard.astro:44`) so `AccountDangerZone`'s `email: string` prop is satisfied. Render a heading, the signed-in email, and a "Danger zone" section hosting `<AccountDangerZone client:load email={email} />`. No data queries needed (so no db-helper try/catch required here). Add a link to `/account` from the dashboard header (`src/pages/dashboard.astro:47-62`) for discoverability.

### Success Criteria:

#### Automated Verification:

- Build passes: `npm run build`
- Lint passes: `npm run lint`
- `src/pages/account.astro`, `src/components/account/DeleteAccountDialog.tsx`, `src/components/account/AccountDangerZone.tsx` exist

#### Manual Verification:

- `/account` renders for a signed-in user, showing their email and a danger zone
- The delete confirm button is disabled until the exact email is typed
- Completing the flow deletes the account, clears the session, and redirects to `/`; navigating back to a protected route redirects to sign-in
- A forced failure (service-role key removed) shows an inline error in the dialog and leaves the user signed in with data intact
- The dashboard header links to `/account`

**Implementation Note**: After automated verification passes, pause for manual confirmation. This is the final phase.

---

## Testing Strategy

### Manual Testing Steps:

1. Seed a user with several products and sales entries (use the existing demo seed).
2. Sign in, go to `/account`, confirm the email and danger zone render.
3. Click "Delete account"; confirm the button is disabled until the exact email is typed.
4. Temporarily unset `SUPABASE_SERVICE_ROLE_KEY`, attempt deletion, confirm an inline error appears and the session/data survive (503 path).
5. Restore the key, complete deletion; confirm redirect to `/`, that the old session no longer authenticates (visit `/dashboard` → redirected to sign-in), and that the user's `products` + `sales_entries` rows are gone (DB query).
6. Confirm signed-out access to `/account` redirects to `/auth/signin`.

## Performance Considerations

Negligible. One admin delete plus one sign-out per invocation; cascade deletes are handled by Postgres FKs. No hot path, no added queries on read routes.

## Migration Notes

No schema migration. The cascade FKs already exist from F-01. The only new operational requirement is provisioning `SUPABASE_SERVICE_ROLE_KEY` as a Cloudflare Worker secret in production (`wrangler secret put SUPABASE_SERVICE_ROLE_KEY`) and in `.dev.vars` for local dev — without it the feature degrades to a 503 rather than breaking other routes.

## References

- Roadmap slice: `context/foundation/roadmap.md` (S-07)
- Change identity: `context/changes/account-deletion-and-data-retention/change.md`
- Cascade FKs: `supabase/migrations/20260530000001_create_products.sql:3`, `supabase/migrations/20260530000002_create_sales_entries.sql:4`
- Dialog pattern: `src/components/products/DeleteProductDialog.tsx`, `src/components/products/ProductCatalog.tsx:89-108`
- API route pattern: `src/pages/api/products/[id].ts`, `src/pages/api/auth/signout.ts`
- Lessons: `context/foundation/lessons.md` (wrap throw-on-error DB calls; preserve `{ error }` contract)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Service-role config + admin client factory

#### Automated

- [x] 1.1 Build passes: `npm run build` — 845eeaa
- [x] 1.2 Lint/typecheck passes: `npm run lint` — 845eeaa
- [x] 1.3 `SUPABASE_SERVICE_ROLE_KEY` in `astro.config.mjs` env schema and `.env.example` — 845eeaa
- [x] 1.4 `createAdminClient` exported from `src/lib/supabase.ts` — 845eeaa

#### Manual

- [x] 1.5 `createAdminClient()` returns `null` when the key is unset (no throw) — 845eeaa
- [x] 1.6 No service-role key value present in committed files — 845eeaa

### Phase 2: Delete-account API route + route guard

#### Automated

- [x] 2.1 Build passes: `npm run build` — 1613438
- [x] 2.2 Lint passes: `npm run lint` — 1613438
- [x] 2.3 `"/account"` present in `PROTECTED_ROUTES` — 1613438

#### Manual

- [x] 2.4 `DELETE /api/account` signed out returns 401 `{ error }` — 1613438
- [x] 2.5 Service-role key unset → authenticated `DELETE /api/account` returns 503 and does not delete — 1613438
- [x] 2.6 Configured → authenticated `DELETE /api/account` returns 200; `auth.users` row gone; `products`/`sales_entries` cascade-deleted — 1613438
- [x] 2.7 `/account` signed out redirects to `/auth/signin` — 1613438

### Phase 3: DeleteAccountDialog island + /account page

#### Automated

- [x] 3.1 Build passes: `npm run build`
- [x] 3.2 Lint passes: `npm run lint`
- [x] 3.3 `account.astro`, `DeleteAccountDialog.tsx`, `AccountDangerZone.tsx` exist

#### Manual

- [x] 3.4 `/account` renders email + danger zone for a signed-in user
- [x] 3.5 Confirm button disabled until exact email typed
- [x] 3.6 Full flow deletes account, clears session, redirects to `/`; protected routes then redirect to sign-in
- [x] 3.7 Forced failure shows inline error, session + data survive
- [x] 3.8 Dashboard header links to `/account`
