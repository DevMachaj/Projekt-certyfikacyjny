# Product Catalog CRUD (S-01) Implementation Plan

## Overview

Build the product catalog CRUD slice on top of the F-01 data foundation: a logged-in
owner can add, edit, and delete products (name, current stock quantity, supplier lead
time in days, buffer days defaulting to 7), with every change reflected immediately and
strict per-account data isolation. The slice introduces the project's first domain API
routes and its first JSON-fetch React island — the patterns S-02 (sales entry +
classification) and S-03 (dashboard) will build on.

## Current State Analysis

The data layer is complete and the roadmap's flagged primary risk is already mitigated:

- **`products` table + RLS exist** (`supabase/migrations/20260530000001_create_products.sql`):
  columns `id`, `user_id`, `name`, `stock_quantity` (`>= 0`), `lead_time_days`
  (`> 0`, **nullable**), `buffer_days` (`> 0`, `DEFAULT 7`), `created_at`, `updated_at`;
  four per-operation RLS policies keyed on `auth.uid() = user_id`.
- **Cascade delete is enforced at the DB level**: `sales_entries.product_id REFERENCES
products(id) ON DELETE CASCADE` (`20260530000002_create_sales_entries.sql:3`). FR-011's
  "deleting a product permanently removes all associated sales entries" therefore requires
  **no application-layer cascade code** — deleting the product row is sufficient.
- **Domain types exist** (`src/types.ts`): `Product` interface matches the schema exactly.
- **Read query pattern exists** (`src/lib/db.ts`): `getProductsByUser(supabase, userId)`
  returns products ordered by name — the convention to extend with write helpers.
- **Auth/SSR pattern** (`src/lib/supabase.ts`, `src/middleware.ts`): `createClient(headers,
cookies)` returns an RLS-scoped SSR client or `null` if unconfigured; middleware attaches
  `context.locals.user` and guards `PROTECTED_ROUTES` (currently only `/dashboard`).
- **UI conventions**: React islands with client-side validation (`SignInForm.tsx`),
  reusable `FormField` (`src/components/auth/FormField.tsx`), `cn()` helper, glassmorphism
  "cosmic" dark theme, `lucide-react` icons. Only the `button` shadcn component is installed.

Two gaps S-01 must close:

- **`zod` is not installed**, although CLAUDE.md mandates "validate input with zod" for API
  routes. This plan adds it.
- **No `/products` page exists** and `PROTECTED_ROUTES` does not guard it yet.

## Desired End State

A logged-in owner visits `/products` and sees their catalog (or a friendly empty-state CTA).
They can:

- **Add** a product via a modal form (name, stock quantity, lead time optional, buffer days
  prefilled to 7) — the new product appears in the list immediately without a full reload.
- **Edit** any product field via the same modal prefilled with current values — changes
  appear in place on save.
- **Delete** a product via a confirmation modal that names the product and warns that all its
  sales entries will be permanently removed — the row disappears immediately.
- Never see another account's products; all reads/writes are RLS-scoped.

Verification: `npm run build`, `npm run lint`, `npm run format` pass; manual end-to-end test
of add/edit/delete on local Supabase, plus a two-account isolation check and a cascade check
(create product → add a sales_entry row → delete product → row is gone).

### Key Discoveries:

- DB cascade already handles FR-011's sales-entry cleanup — `20260530000002_create_sales_entries.sql:3`.
- `lead_time_days` is nullable by design (FR-007 "if lead time is not set") — the form and
  schema must treat it as optional, and an empty input must persist as `NULL`, not `0`.
- RLS makes ownership implicit: API handlers set `user_id` from `locals.user.id` and rely on
  policies for isolation; no manual `WHERE user_id` filter is needed on writes, but reads use
  `getProductsByUser` for ordering.
- `createClient` returns `null` when Supabase env is absent — every route must handle that
  (auth routes redirect; JSON routes should return a 503/500 JSON error).

## What We're NOT Doing

- **No sales entries, velocity, or classification** — that is S-02. No "classification updates
  on each change" wiring (US-02 mentions it, but there is nothing to classify until S-02).
- **No dashboard / grouped view** — `/dashboard` stays as-is; S-03 owns it.
- **No changes to auth flow** — signin still redirects to `/`; `/products` is reachable via nav.
- **No DB migration changes** — the F-01 schema is sufficient.
- **No pagination / search / sort controls** beyond the existing alphabetical order (small data
  volume per PRD `target_scale`).
- **No toast library** — inline error feedback is a lightweight local component.
- **No undo / soft-delete / archive** — delete is permanent (PRD FR-011).

## Implementation Approach

Server-first, then UI. Phase 1 establishes the validated JSON API and write helpers,
independently verifiable via `curl` and build/typecheck without any UI. Phase 2 builds the
catalog page and React island against that stable contract. A single `productSchema` (zod) is
the shared source of truth: the API route parses/validates request bodies with it, and the
island reuses the same rules for client-side validation, so error semantics match on both
sides. CRUD mutations call JSON routes via `fetch` and update island state in place to satisfy
the "reflected immediately" requirement and to lay the groundwork for S-02's 1-second refresh.

## Critical Implementation Details

- **Nullable `lead_time_days`**: the form's lead-time input is optional; an empty string must be
  coerced to `null` before validation/persistence. The zod schema models it as
  `number (int, >0) | null`. Persisting `0` would violate the DB `CHECK (lead_time_days > 0)`
  and misrepresent "not set".
- **`buffer_days` default**: the add form prefills `7`; if the field is cleared the schema should
  reject (it is `NOT NULL > 0`), so treat empty as invalid rather than silently defaulting.
- **RLS ownership on update/delete**: route handlers must not trust a client-supplied `user_id`.
  Set/scope by `locals.user.id`; rely on RLS `USING (auth.uid() = user_id)` so a mismatched id
  returns zero affected rows. A delete/update that matches no row should surface as 404, not a
  silent 200.

## Phase 1: Data access, validation, and product API routes

### Overview

Install zod, define the shared product validation schema, add create/update/delete query
helpers to `src/lib/db.ts`, and expose JSON API routes for the catalog. Fully verifiable
server-side before any UI exists.

### Changes Required:

#### 1. Add zod dependency

**File**: `package.json`

**Intent**: Add `zod` as a runtime dependency so API routes can validate input per CLAUDE.md.

**Contract**: `zod` appears in `dependencies`; `npm install` run so the lockfile updates and the
Cloudflare/Workers build resolves it.

#### 2. Shared product validation schema

**File**: `src/lib/validation/product.ts` (new)

**Intent**: Single source of truth for product field rules, reused by the API route and the
React island. Export the schema plus an inferred input type.

**Contract**: Exports `productSchema` (a zod object) and `type ProductInput = z.infer<typeof productSchema>`.
Fields: `name` non-empty trimmed string; `stock_quantity` int `>= 0`; `lead_time_days` int `> 0`
or `null` (optional → `null`); `buffer_days` int `> 0`. Rules mirror the DB CHECK constraints so
client and server agree. For PATCH, expose a `.partial()` variant (`productUpdateSchema`).

#### 3. Write query helpers

**File**: `src/lib/db.ts`

**Intent**: Extend the existing typed-helper pattern with create/update/delete, matching
`getProductsByUser`'s shape (throw on error, return typed rows).

**Contract**: Add `createProduct(supabase, userId, input): Promise<Product>` (inserts with
`user_id`, returns the inserted row via `.select().single()`); `updateProduct(supabase, id,
patch): Promise<Product | null>` (updates by `id`, RLS-scoped, returns row or `null` if none
matched); `deleteProduct(supabase, id): Promise<boolean>` (deletes by `id`, returns whether a
row was removed). All rely on RLS for ownership; none filter `user_id` manually except `userId`
set on insert.

> Note: `products.updated_at` is `DEFAULT now()` on insert only — there is no DB trigger
> (`20260530000001_create_products.sql:9`). `updateProduct` must therefore include
> `updated_at: new Date().toISOString()` in its update payload so the timestamp reflects edits;
> otherwise it stays frozen at insert time. No migration needed.

#### 4. Collection API route

**File**: `src/pages/api/products/index.ts` (new)

**Intent**: List the owner's products and create a new one. First domain JSON route — establishes
the `export const prerender = false`, `createClient` null-guard, `locals.user` auth-guard, and
zod-validation conventions for S-02/S-03.

**Contract**: `export const prerender = false`. `GET` → `200 { products: Product[] }` via
`getProductsByUser`. `POST` → parse JSON body with `productSchema`; on failure `400 { error,
issues }`; on success `createProduct` then `201 { product }`. Both: if `!locals.user` →
`401 { error }`; if `createClient` returns `null` → `503 { error }`.

#### 5. Item API route

**File**: `src/pages/api/products/[id].ts` (new)

**Intent**: Edit and delete a single product by id.

**Contract**: `export const prerender = false`. `PATCH` → validate body with `productUpdateSchema`,
call `updateProduct`; `404` if no row matched (RLS or missing), else `200 { product }`. `DELETE`
→ `deleteProduct`; `404` if nothing removed, else `204`. Same `401`/`503` guards as the collection
route. Deleting relies on the DB `ON DELETE CASCADE` to remove sales entries — no extra code.

### Success Criteria:

#### Automated Verification:

- Dependency installs: `npm install` completes and `zod` is in `package.json`
- Type checking passes: `npm run build`
- Linting passes: `npm run lint`
- Formatting passes: `npm run format`

#### Manual Verification:

- With local Supabase running and an authenticated session cookie, `POST /api/products`
  with valid body returns `201` and the row appears in Supabase Studio under the right `user_id`
- `POST /api/products` with `lead_time_days` omitted persists `NULL` (not `0`); with invalid
  body (empty name / negative stock) returns `400` with issues
- `PATCH /api/products/[id]` updates fields and returns `200`; unknown/foreign id returns `404`
- `DELETE /api/products/[id]` returns `204`; re-listing no longer includes it; a sales_entries
  row referencing that product is gone (cascade verified)
- Requests without a session return `401`

**Implementation Note**: After Phase 1 automated verification passes, pause for manual
confirmation of the API behavior (curl or REST client) before starting Phase 2.

---

## Phase 2: Catalog page and React island UI

### Overview

Build the `/products` page and the `ProductCatalog` React island: list, add/edit modal sharing
one validated form, delete-confirmation modal, empty-state CTA, and inline error feedback. Wire
route protection and a nav link.

### Changes Required:

#### 1. Dialog primitive

**File**: `src/components/ui/dialog.tsx` (new, via `npx shadcn@latest add dialog`)

**Intent**: Provide the modal primitive used by both the add/edit form and the delete confirm.

**Contract**: Standard shadcn "new-york" dialog exports (`Dialog`, `DialogContent`, `DialogHeader`,
`DialogTitle`, `DialogFooter`, etc.). Restyle minimally to fit the cosmic theme if needed.

#### 2. Product form (add/edit, shared)

**File**: `src/components/products/ProductForm.tsx` (new)

**Intent**: One controlled form for both add (empty) and edit (prefilled), validating with the
shared `productSchema` client-side before submit and surfacing field errors via `FormField`.

**Contract**: Props `{ initial?: Product; onSubmit(input: ProductInput): Promise<void>; pending,
serverError }`. Renders name / stock_quantity / lead_time_days (optional) / buffer_days (default 7) fields. Empty lead-time → `null`. Reuses `FormField` and `SubmitButton` patterns; validation
errors map per field.

#### 3. Delete confirmation

**File**: `src/components/products/DeleteProductDialog.tsx` (new)

**Intent**: Confirm destructive delete, explicitly warning that all sales entries for the product
are permanently removed (FR-011 cascade).

**Contract**: Props `{ product; onConfirm(): Promise<void>; pending }`. Names the product and states
the cascade consequence; confirm triggers the DELETE call.

#### 4. Catalog island

**File**: `src/components/products/ProductCatalog.tsx` (new)

**Intent**: Top-level island owning catalog state and all CRUD fetches; renders list, hosts the
add/edit and delete modals, the empty-state CTA, and inline error feedback.

**Contract**: Props `{ initialProducts: Product[] }`. Holds `products` state seeded from props;
`fetch` calls to `/api/products` (POST), `/api/products/[id]` (PATCH/DELETE) update state in place
(no reload). Empty list → "Add your first product" CTA. Fetch/validation/network failures render a
dismissible inline error message near the relevant action. Each row shows name, stock, lead time
(or "not set"), buffer days, with Edit and Delete actions.

#### 5. Catalog page

**File**: `src/pages/products.astro` (new)

**Intent**: Server-render the page shell, fetch the initial product list server-side (RLS-scoped),
and hydrate the island.

**Contract**: Uses `Layout`; reads `Astro.locals.user`; builds an SSR `createClient` and calls
`getProductsByUser` to pass `initialProducts` into `<ProductCatalog client:load />`. Matches the
cosmic theme of `dashboard.astro`. Guard: `createClient` returns `null` when Supabase env is unset
(`src/lib/supabase.ts:6`) — if it's `null`, pass `initialProducts={[]}` rather than calling
`getProductsByUser` on a null client (the config Banner already warns about the missing env).

#### 6. Route protection + navigation

**Files**: `src/middleware.ts`, `src/pages/dashboard.astro` (and/or `Topbar.astro`)

**Intent**: Guard `/products` behind auth and provide a link to reach it.

**Contract**: Add `"/products"` to `PROTECTED_ROUTES`. Add a visible nav link to `/products`
(e.g., from the dashboard card or `Topbar`). No change to signin redirect behavior.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run build`
- Linting passes: `npm run lint`
- Formatting passes: `npm run format`

#### Manual Verification:

- Visiting `/products` while logged out redirects to `/auth/signin`
- Empty catalog shows the "Add your first product" CTA
- Adding a product (with and without lead time) shows it in the list immediately, no full reload
- Editing a product updates the row in place on save; validation errors show per field
- Deleting shows the confirmation modal naming the product; confirming removes the row immediately
- A network/validation error surfaces as an inline message rather than failing silently
- Two-account isolation: account B never sees account A's products
- Cascade: a product with sales entries, when deleted, removes those entries (check Studio)

**Implementation Note**: After Phase 2 automated verification passes, pause for manual end-to-end
confirmation (including the isolation and cascade checks) before considering the slice complete.

---

## Testing Strategy

### Unit Tests:

- No test framework is configured in this repo; verification is via `npm run build` (type-check),
  `npm run lint`, and manual testing. Do not introduce a test harness as part of this slice.

### Integration Tests:

- Manual API verification with curl/REST client against local Supabase (Phase 1).

### Manual Testing Steps:

1. `npx supabase start`; sign in; visit `/products` (redirect check while logged out first).
2. Add a product with all fields; confirm immediate appearance and Studio row with correct `user_id`.
3. Add a product with lead time blank; confirm `lead_time_days` is `NULL`.
4. Edit a product's stock and name; confirm in-place update.
5. Trigger validation errors (empty name, negative stock); confirm per-field messages.
6. Delete a product (with at least one sales_entries row) via the modal; confirm row + entries gone.
7. Sign in as a second account; confirm no cross-account visibility.

## Performance Considerations

Data volume is small (PRD `target_scale: data_volume: small`); alphabetical list with no
pagination is sufficient. In-place state updates avoid full-page reloads, keeping CRUD feedback
well under the perceptual budget and pre-positioning the island for S-02's 1-second classification
refresh.

## Migration Notes

None — the F-01 schema is sufficient; no new migrations.

## References

- Roadmap slice: `context/foundation/roadmap.md` (S-01)
- PRD: `context/foundation/prd.md` (US-02, FR-003, FR-004, FR-011, NFR-003)
- Data foundation: `context/changes/supabase-schema-and-types/plan-brief.md`
- Schema: `supabase/migrations/20260530000001_create_products.sql`, `..._create_sales_entries.sql`
- Patterns: `src/lib/db.ts`, `src/pages/api/auth/signin.ts`, `src/components/auth/SignInForm.tsx`,
  `src/components/auth/FormField.tsx`, `src/middleware.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data access, validation, and product API routes

#### Automated

- [x] 1.1 Dependency installs: `npm install` completes and `zod` is in `package.json`
- [x] 1.2 Type checking passes: `npm run build`
- [x] 1.3 Linting passes: `npm run lint`
- [x] 1.4 Formatting passes: `npm run format`

#### Manual

- [x] 1.5 `POST /api/products` with valid body returns `201`; row appears under correct `user_id`
- [x] 1.6 Omitted `lead_time_days` persists `NULL`; invalid body returns `400` with issues
- [x] 1.7 `PATCH /api/products/[id]` updates and returns `200`; foreign/unknown id returns `404`
- [x] 1.8 `DELETE /api/products/[id]` returns `204`; product gone on re-list; sales entry cascade verified
- [x] 1.9 Requests without a session return `401`

### Phase 2: Catalog page and React island UI

#### Automated

- [ ] 2.1 Type checking passes: `npm run build`
- [ ] 2.2 Linting passes: `npm run lint`
- [ ] 2.3 Formatting passes: `npm run format`

#### Manual

- [ ] 2.4 `/products` while logged out redirects to `/auth/signin`
- [ ] 2.5 Empty catalog shows "Add your first product" CTA
- [ ] 2.6 Adding a product (with and without lead time) appears immediately, no full reload
- [ ] 2.7 Editing updates the row in place on save; per-field validation errors show
- [ ] 2.8 Delete confirmation modal names the product; confirming removes the row immediately
- [ ] 2.9 Network/validation error surfaces as an inline message, not silent failure
- [ ] 2.10 Two-account isolation: account B never sees account A's products
- [ ] 2.11 Cascade: deleting a product with sales entries removes those entries (Studio check)
