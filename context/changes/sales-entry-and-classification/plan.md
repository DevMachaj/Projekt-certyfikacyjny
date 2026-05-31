# Sales Entry Logging + Velocity Classification (S-02) Implementation Plan

## Overview

Build the roadmap North star: the end-to-end loop where a logged-in owner logs
non-overlapping sales entries for a product and immediately sees a velocity
**classification** (Understocked / Watch / OK / Slow-mover / Insufficient data),
the **threshold definition** for that state, and a specific **recommended action**
("Order X units" / "Consider promotion" / "Set lead time to get reorder suggestion") —
and can delete an entry and watch the classification recalculate. This slice introduces
the project's core IP — the classification engine — plus the first nested resource API,
the first DB exclusion constraint, the first per-entity detail page, and the repo's first
test harness.

## Current State Analysis

The data foundation (F-01) and product CRUD (S-01) are complete; the patterns S-02 reuses
are already proven in the codebase:

- **`sales_entries` table + RLS exist** (`supabase/migrations/20260530000002_create_sales_entries.sql`):
  columns `id`, `product_id` (FK `ON DELETE CASCADE`), `user_id`, `units_sold` (`CHECK > 0`),
  `start_date` / `end_date` (SQL `date`), `created_at`, plus `CONSTRAINT start_before_end CHECK
(end_date >= start_date)`. Four per-operation RLS policies keyed on `auth.uid() = user_id`;
  the insert policy additionally verifies the parent product belongs to the same user. **There
  is no overlap constraint** — this is the roadmap's flagged Unknown, resolved by this plan.
- **`SalesEntry` type exists** (`src/types.ts:14`) and matches the schema exactly. The
  `ClassificationState` union (`src/types.ts:1`) is already declared.
- **Read helper exists** (`src/lib/db.ts:56`): `getSalesEntriesByProduct(supabase, productId)`
  returns entries ordered by `start_date` — ready for the velocity computation.
- **API route conventions** (`src/pages/api/products/index.ts`, `[id].ts`): `export const
prerender = false`, `!locals.user → 401`, `createClient` returns `null → 503`, invalid JSON →
  `400`, zod `safeParse` failure → `400 { error, issues }`, success → `200/201/204`, no-row →
  `404`. RLS makes ownership implicit; handlers set `user_id` from `locals.user.id`.
- **Shared zod schema pattern** (`src/lib/validation/product.ts`): one schema is the single
  source of truth for client island + server route; rules mirror DB CHECK constraints.
- **db helper pattern** (`src/lib/db.ts`): typed helpers that throw on error and return typed
  rows (`createProduct`, `updateProduct`, `deleteProduct`).
- **Island + page pattern**: `src/pages/products.astro` SSR-fetches initial data (RLS-scoped,
  null-guarded) and hydrates `<ProductCatalog client:load>`; the island holds state seeded from
  props, `fetch`es the JSON API, updates state in place, and renders inline error banners
  (`src/components/products/ProductCatalog.tsx`). Forms validate against the shared schema
  client-side via `FormField` + `ServerError` (`src/components/products/ProductForm.tsx`).
- **Cosmic dark theme + lucide-react icons**; `cn()` helper; only `button` and `dialog` shadcn
  components installed.

Gaps S-02 must close:

- **No classification engine** exists anywhere — the PRD formulas and threshold table are
  unimplemented.
- **No test framework** — S-01 deliberately skipped one; this plan adds Vitest scoped to the
  engine.
- **No nested sales-entry API route, no sales-entry validation schema, no write helpers**
  (`createSalesEntry` / `deleteSalesEntry`).
- **No `/products/[id]` detail page** and the catalog rows are not yet clickable/linked to one;
  `PROTECTED_ROUTES` does not guard it.
- **No overlap protection** at the API or DB level.

## Desired End State

A logged-in owner clicks a product in `/products` and lands on `/products/[id]`. There they see:

- A **classification panel**: the current state badge, the plain-language **threshold definition**
  for that state, and the **recommended action** (a specific "Order X units" quantity for
  Understocked, "Consider promotion" for Slow-mover, or "Set lead time to get reorder suggestion"
  when lead time is unset). With < 7 days of non-overlapping history, it shows "Insufficient data".
- A **sales-entry list** (units sold, date range) with an **add** form and a **delete** action per
  entry. Adding an entry whose range overlaps an existing one is rejected with a clear message;
  adding a valid entry or deleting one updates the classification **in place within 1 second**
  (NFR-001), with no full reload.
- Strict per-account isolation; no other account's product or entries are reachable.

Verification: `npm test` (engine units) passes; `npm run build`, `npm run lint`, `npm run format`
pass; the new migration applies cleanly on `npx supabase start`; manual end-to-end test of
log / overlap-reject / delete / recompute on local Supabase, plus a two-account isolation check
and an overlap-constraint check at the DB level.

### Key Discoveries:

- DB cascade + RLS already cover entry cleanup and isolation (`20260530000002_create_sales_entries.sql`):
  the API sets `user_id` from `locals.user.id`; the insert policy already enforces parent-product
  ownership, so no manual ownership filter is needed on writes.
- `getSalesEntriesByProduct` already returns entries ordered by `start_date` — directly consumable
  by both the engine (server-side initial render + per-mutation recompute) and the UI list.
- `start_date` / `end_date` are SQL `date` (no time component) — day-count math is pure date
  arithmetic, no timezone-of-day concerns within a date; only the "reject future end_date" check
  needs a defined "today" (use UTC date).
- The PRD threshold table has **overlapping conditions** (a product can satisfy both an OK day-band
  and the Slow-mover `velocity < 0.1` rule) and **lead-time-dependent bands** that are
  uncomputable when `lead_time_days` is null — both gaps are resolved by explicit decisions below.

## What We're NOT Doing

- **No sales-entry editing** — PRD specifies log (FR-005) + delete (FR-012) only; correction is
  delete-then-re-add (US-03). No PATCH route or edit form for entries.
- **No classification on the catalog list** — `/products` rows stay plain (name/stock/lead/buffer);
  classification appears only on `/products/[id]`. The grouped multi-product view and its N+1/perf
  query design are explicitly S-03's job.
- **No dashboard / grouped view** — S-03 owns `/dashboard`.
- **No demand forecasting, no purchase-order execution** — PRD Non-Goals; the slice classifies and
  recommends only.
- **No undo / soft-delete / audit trail** for entries — delete is permanent (FR-012).
- **No max-range cap** on entry date ranges — no PRD basis; only reject future `end_date`.
- **No changes to the product schema or product CRUD routes** — F-01 + S-01 are sufficient.

## Implementation Approach

Engine-first, then server, then UI — each phase independently verifiable.

**Phase 1** builds the pure `classify()` engine and its Vitest suite in complete isolation (no DB,
no UI). This de-risks the product's core IP first: a silent math bug here invalidates the entire
hypothesis the slice exists to test, so it gets automated coverage before anything depends on it.

**Phase 2** hardens the data path: a Postgres `daterange` exclusion constraint as the absolute
overlap backstop, a shared zod `salesEntrySchema`, `createSalesEntry` / `deleteSalesEntry` helpers,
and nested API routes that re-check overlap in-app (friendly 409), mutate, then return the
**recomputed classification** in the response so the UI needs a single round-trip (NFR-001).

**Phase 3** builds the `/products/[id]` detail page and its React island against that stable
contract, computing the initial classification server-side for first paint and updating it in place
after each mutation.

The classification engine is the single source of truth, computed **server-side only** (it is the
product's IP and never needs to ship to the browser): the API returns it after each mutation and
the page computes it for initial render.

## Critical Implementation Details

- **Overlap semantics + the DB constraint**: two date ranges overlap if `a.start <= b.end AND
b.start <= a.end` (inclusive endpoints — adjacent ranges that share no day, e.g. Jan 1–5 and
  Jan 6–10, do **not** overlap). The DB backstop is a `GiST` exclusion constraint over
  `daterange(start_date, end_date, '[]')` (inclusive on both ends) scoped to `product_id`,
  requiring the `btree_gist` extension. The API-layer check must use the identical inclusive
  semantics so app and DB never disagree.
- **Inclusive day-count**: a single entry covers `(end_date − start_date) + 1` calendar days; total
  history days = the **sum** across entries (valid because they are non-overlapping). A one-day
  entry counts as 1 day. This definition governs the 7-day "Insufficient data" threshold (FR-008):
  `< 7` summed days → Insufficient data.
- **Classification evaluation order (total, deterministic)**: (1) `< 7` days → Insufficient data;
  (2) `velocity < 0.1` units/day OR `days_of_stock >= 90` → Slow-mover; (3) lead-time bands, only
  when `lead_time_days` is set: `days_of_stock < lead_time_days` → Understocked, `< 2×lead_time` →
  Watch, else (`< 90`, already past the Slow-mover gate) → OK; (4) when `lead_time_days` is null and
  not caught by the Slow-mover gate → OK state with the "Set lead time…" action. `velocity < 0.1`
  is checked before the day-bands so a barely-selling item surfaces as Slow-mover even if its
  day-band reads OK.
- **`days_of_stock` and divide-by-zero**: `velocity = total_units / total_days`; since entries
  require `units_sold > 0` and total_days ≥ 1, velocity > 0 whenever any entry exists, so
  `days_of_stock = stock_quantity / velocity` is finite. (With zero entries the engine returns
  Insufficient data before dividing.)
- **Reorder quantity**: `Math.ceil(velocity × (lead_time_days + buffer_days))`, shown only for
  Understocked **and** only when `lead_time_days` is set; rounded up so the safer side (avoid
  stockout) is favored.
- **NFR-001 single round-trip**: the POST/DELETE entry responses include the recomputed
  classification (engine run on the server against the post-mutation entry set), so the island never
  makes a second fetch to refresh state.

## Phase 1: Classification engine + Vitest harness

### Overview

Implement the pure, dependency-free classification engine and its day-count math, and add a minimal
Vitest setup that exercises every state, boundary threshold, and edge case. No DB, no I/O, no UI —
fully verifiable in isolation.

### Changes Required:

#### 1. Classification engine

**File**: `src/lib/classification.ts` (new)

**Intent**: The product's core logic — a pure function turning a product + its sales entries into a
classification state, the threshold definition text for that state, and a recommended action. Single
source of truth, server-side only.

**Contract**: Exports `classify(product, entries): ClassificationResult` where `ClassificationResult`
= `{ state: ClassificationState; velocity: number | null; daysOfStock: number | null; totalDays:
number; totalUnits: number; thresholdLabel: string; recommendation: Recommendation }`.
`Recommendation` is a discriminated type covering `{ kind: "order"; units: number }`,
`{ kind: "promote" }`, `{ kind: "set-lead-time" }`, and `{ kind: "none" }` (Insufficient data /
Watch / OK with no action). Also export small pure helpers: `entryDays(entry): number` (inclusive,
`(end − start) + 1`), `totalHistoryDays(entries): number` (sum), and `velocityOf(product, entries)`.
Evaluation order, thresholds, null-lead-time handling, and `Math.ceil` rounding follow exactly the
rules in **Critical Implementation Details**. `thresholdLabel` is a human-readable definition for the
assigned state (e.g. Understocked → "Fewer than lead-time days of stock remaining at current velocity").
Additionally export `THRESHOLD_DEFINITIONS: Record<ClassificationState, string>` — the full ladder of
all five states' definitions — so the UI can render the complete transparency legend FR-006 calls for
("display the threshold definition for each state"), not just the assigned one. `thresholdLabel` is
then simply `THRESHOLD_DEFINITIONS[result.state]`.
Dates parsed from the `YYYY-MM-DD` strings as UTC to avoid off-by-one. No imports beyond `@/types`.

#### 2. Vitest setup

**File**: `package.json`, `vitest.config.ts` (new)

**Intent**: Introduce the repo's first test harness, scoped to unit-testing pure logic, with a
`npm test` script future slices can reuse.

**Contract**: Add `vitest` (and `@vitest/coverage` optional) to `devDependencies`; add
`"test": "vitest run"` (and optionally `"test:watch": "vitest"`) to `scripts`. `vitest.config.ts`
resolves the `@/*` alias to `./src/*` so test imports match app imports. No jsdom/browser env needed
(engine is pure) — default node environment.

#### 3. Engine unit tests

**File**: `src/lib/classification.test.ts` (new)

**Intent**: Lock the engine's behavior against regressions across every state and boundary.

**Contract**: Covers, with worked numeric examples: inclusive `entryDays` (single-day = 1 day);
`totalHistoryDays` summed across multiple entries; Insufficient data at `< 7` days and clearing at
`>= 7`; Slow-mover via `velocity < 0.1` AND via `days_of_stock >= 90` (including the precedence case
where an OK day-band item with `velocity < 0.1` resolves to Slow-mover); Understocked / Watch / OK
band boundaries (test the exact `< lead`, `= lead`, `= 2×lead`, `< 90` edges); null `lead_time_days`
→ OK + "set-lead-time" recommendation (and still Slow-mover when `velocity < 0.1`); reorder quantity
`Math.ceil` correctness and that it is suppressed when lead time is null; zero-entries → Insufficient
data without divide-by-zero.

### Success Criteria:

#### Automated Verification:

- Engine unit tests pass: `npm test`
- Type checking passes: `npm run build`
- Linting passes: `npm run lint`
- Formatting passes: `npm run format`

#### Manual Verification:

- Spot-check two or three worked examples by hand against the PRD threshold table to confirm
  the engine's output matches the spec (e.g. a clearly Understocked product and a clearly
  Slow-mover product).

**Implementation Note**: After Phase 1 automated verification passes, pause for manual confirmation
that the engine's worked-example output matches the PRD before building anything on top of it.

---

## Phase 2: Overlap constraint, validation schema, db helpers, sales-entry API

### Overview

Add the DB exclusion-constraint backstop, the shared sales-entry zod schema, the create/delete db
helpers, and the nested API routes — which re-check overlap in-app, mutate, and return the recomputed
classification. Fully verifiable server-side via curl before any UI exists.

### Changes Required:

#### 1. Overlap exclusion constraint migration

**File**: `supabase/migrations/20260531000001_sales_entries_no_overlap.sql` (new)

**Intent**: Make overlapping date ranges for the same product physically impossible at the DB level —
the absolute backstop behind the API check, closing the silent-corruption risk even under a race or a
future insert path.

**Contract**: `CREATE EXTENSION IF NOT EXISTS btree_gist;` then add an exclusion constraint on
`sales_entries` ensuring no two rows with the same `product_id` have overlapping inclusive date
ranges. Use `EXCLUDE USING gist (product_id WITH =, daterange(start_date, end_date, '[]') WITH &&)`.
Verify naming/timestamp follows the `YYYYMMDDHHmmss_short_description.sql` convention and applies
cleanly on a fresh `npx supabase start`.

#### 2. Sales-entry validation schema

**File**: `src/lib/validation/sales-entry.ts` (new)

**Intent**: Single source of truth for sales-entry field rules, reused by the API route and the React
island, mirroring DB CHECK constraints plus the future-date rule.

**Contract**: Exports `salesEntrySchema` (zod object) and `type SalesEntryInput = z.infer<...>`.
Fields: `units_sold` int `> 0`; `start_date` and `end_date` as `YYYY-MM-DD` strings validated as real
calendar dates; a refinement enforcing `end_date >= start_date`; a refinement rejecting `end_date` in
the future (compared against today's UTC date). Error messages are user-facing and map per field. No
`product_id`/`user_id` in the body schema — those come from the route param and `locals.user`.

#### 3. Write query helpers

**File**: `src/lib/db.ts`

**Intent**: Extend the existing typed-helper pattern with create/delete for sales entries, matching
the throw-on-error / return-typed-row shape of the product helpers.

**Contract**: Add `createSalesEntry(supabase, userId, productId, input): Promise<SalesEntry>`
(inserts with `user_id` + `product_id`, returns the inserted row via `.select().single()`); add
`deleteSalesEntry(supabase, id): Promise<boolean>` (deletes by `id`, RLS-scoped, returns whether a
row was removed — same shape as `deleteProduct`). Both rely on RLS for ownership. `getProductById`
helper added if not present (used by the API + page to load the parent product for classification);
contract: `getProductById(supabase, id): Promise<Product | null>` (RLS-scoped, `.eq("id", id)
.maybeSingle()`).

#### 4. Nested collection API route

**File**: `src/pages/api/products/[id]/sales-entries/index.ts` (new)

**Intent**: List a product's sales entries and create a new one, returning the recomputed
classification so the UI updates in a single round-trip (NFR-001).

**Contract**: `export const prerender = false`. Standard guards (`401` no user, `503` null client,
`400` bad JSON / validation). `GET` → `200 { entries, classification }` (load product +
`getSalesEntriesByProduct`, run `classify`). `POST` → validate body with `salesEntrySchema`; **re-check
overlap in-app** against existing entries using inclusive semantics — on overlap return
`409 { error }` with a clear message (and the DB constraint as backstop: translate a unique/exclusion
violation into the same 409 rather than a 500); on success `createSalesEntry`, then recompute and
return `201 { entry, classification }`. If the parent product is not found / not owned → `404`.

#### 5. Sales-entry item API route

**File**: `src/pages/api/products/[id]/sales-entries/[entryId].ts` (new)

**Intent**: Delete a single sales entry and return the recomputed classification.

**Contract**: `export const prerender = false`. Same guards. `DELETE` → `deleteSalesEntry`; `404` if
nothing removed; on success recompute classification over the remaining entries and return
`200 { classification }` (not 204 — the body carries the recomputed state the UI needs). The
recompute may revert the product to "Insufficient data" if remaining history `< 7` days (US-03).

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly: `npx supabase start` (or `supabase db reset`) with no errors
- Type checking passes: `npm run build`
- Linting passes: `npm run lint`
- Formatting passes: `npm run format`

#### Manual Verification:

- `POST /api/products/[id]/sales-entries` with a valid body returns `201` with `entry` +
  `classification`; the row appears in Supabase Studio under the correct `user_id` + `product_id`
- Posting an entry whose range overlaps an existing one returns `409` with a clear message; no row
  is inserted
- The DB exclusion constraint independently rejects an overlapping insert made directly in Studio
  (constraint backstop verified)
- Posting `end_date` in the future, `units_sold <= 0`, or `end_date < start_date` returns `400`
  with issues
- `DELETE /api/products/[id]/sales-entries/[entryId]` returns `200` with recomputed
  `classification`; deleting down to `< 7` days reverts to "Insufficient data"; unknown id → `404`
- Requests without a session return `401`; a foreign product id returns `404` (isolation)

**Implementation Note**: After Phase 2 automated verification passes, pause for manual confirmation of
the API behavior (curl or REST client, including the overlap and constraint checks) before Phase 3.

---

## Phase 3: Product detail page + sales-entry island

### Overview

Build the `/products/[id]` SSR page and the `ProductDetail` React island: the classification panel
(state badge + threshold definition + recommendation), the sales-entry list with an add form and
delete confirmation, in-place updates from the API's returned classification, route protection, and a
link from the catalog rows.

### Changes Required:

#### 1. Sales-entry form

**File**: `src/components/sales/SalesEntryForm.tsx` (new)

**Intent**: Controlled add-entry form validating against the shared `salesEntrySchema` client-side
before submit, surfacing field errors via `FormField` and a server error (e.g. the 409 overlap
message) via `ServerError` — mirroring `ProductForm`.

**Contract**: Props `{ onSubmit(input: SalesEntryInput): Promise<void>; pending; serverError }`.
Fields: `units_sold` (number), `start_date` (date input), `end_date` (date input). Validates with
`salesEntrySchema`, maps issues per field. Date inputs are native `type="date"` producing
`YYYY-MM-DD`. Reuses the cosmic-theme styling and `Button` "Saving…" pattern.

#### 2. Classification panel

**File**: `src/components/sales/ClassificationPanel.tsx` (new)

**Intent**: Display the current classification state, the full threshold ladder, and the recommended
action, driven entirely by the `ClassificationResult` + `THRESHOLD_DEFINITIONS` from the engine/API.

**Contract**: Props `{ classification: ClassificationResult; product: Product }`. Renders a state
badge (color per state — Understocked/Slow-mover emphasized) with the assigned state's `thresholdLabel`
prominent, plus an all-states legend rendering every entry of `THRESHOLD_DEFINITIONS` (the assigned
state highlighted) so the owner sees why this product landed here and what would move it — satisfying
FR-006's "threshold definition for each state" and the PRD's transparency rationale. May present the
full ladder via a collapsible/disclosure to keep the panel compact. Also renders the recommendation:
"Order N units" for `kind:"order"`, "Consider promotion" for `kind:"promote"`, "Set lead time to get
reorder suggestion" for `kind:"set-lead-time"`, and an "Insufficient data" treatment for that state.
Pure presentational — no fetching.

#### 3. Detail island

**File**: `src/components/sales/ProductDetail.tsx` (new)

**Intent**: Top-level island owning entry-list + classification state and all sales-entry fetches;
renders the `ClassificationPanel`, the entry list, the add form, and a delete confirmation, updating
state in place from each API response (no reload, single round-trip → NFR-001).

**Contract**: Props `{ product: Product; initialEntries: SalesEntry[]; initialClassification:
ClassificationResult }`. Holds `entries` + `classification` state seeded from props. Add → `POST` the
nested route; on `201` append the entry and replace `classification` from the response; on `409`/`400`
show the server error in the form. Delete → confirm dialog (reuse the `Dialog` primitive / mirror
`DeleteProductDialog`), `DELETE` the item route, on `200` remove the entry and replace
`classification` from the response. List-level failures surface as a dismissible inline banner (mirror
`ProductCatalog`). Each entry row shows units + date range + a delete action; empty list shows a "Log
your first sales entry" prompt and the Insufficient-data panel.

#### 4. Detail page

**File**: `src/pages/products/[id].astro` (new)

**Intent**: Server-render the detail shell, load the product + its entries (RLS-scoped), compute the
initial classification server-side, and hydrate the island.

**Contract**: Uses `Layout`; reads `Astro.locals.user`; builds an SSR `createClient` (null-guard →
redirect or empty fallback consistent with `products.astro`). Loads the product via `getProductById`;
if not found / not owned → `Astro.redirect("/products")` (or 404). Calls `getSalesEntriesByProduct`
and `classify(product, entries)` to pass `initialEntries` + `initialClassification` into
`<ProductDetail client:load>`. Includes a back-link to `/products`. Matches the cosmic theme.

#### 5. Catalog → detail link

**Files**: `src/components/products/ProductCatalog.tsx`

**Intent**: Make catalog rows navigate to the detail page.

**Contract**: `/products/[id]` is **already guarded** — `src/middleware.ts:4,18` lists `/products` in
`PROTECTED_ROUTES` and matches with `.startsWith(route)`, so any `/products/...` sub-path already
redirects unauthenticated users. No middleware change is needed. In `ProductCatalog`, make each product
row's name (or a "View" affordance) a link to `/products/[id]` without breaking the existing
Edit/Delete actions. No change to product CRUD behavior.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run build`
- Linting passes: `npm run lint`
- Formatting passes: `npm run format`
- Engine tests still pass: `npm test`

#### Manual Verification:

- Visiting `/products/[id]` while logged out redirects to `/auth/signin`
- A product with no entries shows "Insufficient data" and a "Log your first sales entry" prompt
- Logging entries until `>= 7` days of history flips the panel to a real classification within
  ~1 second, with the correct threshold definition and recommendation (verify Understocked shows
  a specific "Order N units"; a product with no lead time shows "Set lead time to get reorder
  suggestion")
- Logging an overlapping range shows the 409 message in the form; no entry is added
- Deleting an entry recalculates the panel in place (~1s); deleting down to `< 7` days reverts to
  "Insufficient data"
- A Slow-mover product (very low velocity) shows "Consider promotion"
- Catalog rows link to the detail page; the back-link returns to `/products`
- Two-account isolation: account B cannot open account A's `/products/[id]` (redirect/404), and
  sees none of A's entries

**Implementation Note**: After Phase 3 automated verification passes, pause for manual end-to-end
confirmation (including the overlap, recompute-timing, and isolation checks) before considering the
slice complete.

---

## Testing Strategy

### Unit Tests:

- Vitest covering the pure classification engine (`src/lib/classification.test.ts`): every state,
  band boundary, the Slow-mover precedence case, null-lead-time handling, inclusive day-count, and
  reorder rounding. This is the one piece where a silent bug invalidates the product hypothesis, so
  it is the sole unit-tested surface in this slice.

### Integration Tests:

- Manual API verification with curl / REST client against local Supabase (Phase 2), including the
  overlap-reject path and the DB-constraint backstop.

### Manual Testing Steps:

1. `npx supabase start` (applies the new exclusion-constraint migration); sign in.
2. Open a product detail page (logged-out redirect check first).
3. Log entries spanning `< 7` days → confirm "Insufficient data"; cross the 7-day threshold → confirm
   the panel flips to a real classification within ~1s.
4. Verify Understocked shows a specific "Order N units"; clear the product's lead time and confirm the
   action becomes "Set lead time to get reorder suggestion".
5. Log a very-low-velocity history → confirm "Slow-mover" + "Consider promotion".
6. Attempt an overlapping range → confirm the 409 message and no inserted row; attempt the same insert
   directly in Studio → confirm the DB constraint rejects it.
7. Delete an entry → confirm in-place recompute; delete down to `< 7` days → confirm revert to
   "Insufficient data".
8. Sign in as a second account → confirm no cross-account visibility of the product or its entries.

## Performance Considerations

Data volume is small (PRD `target_scale: data_volume: small`). The classification engine is
arithmetic over a handful of entries; the only I/O on a mutation is one write + one re-query of the
product's entries, and the API returns the recomputed classification in the same response so the UI
needs a single round-trip — comfortably inside NFR-001's 1-second budget. The detail page computes
classification for exactly one product (no N+1); the multi-product grouped view and its query design
are deferred to S-03.

## Migration Notes

One new migration adds the `btree_gist` extension and a `daterange` exclusion constraint to
`sales_entries`. It is additive and applies to existing rows; if any overlapping rows already exist in
a dev DB the migration will fail — none should exist at this stage (S-02 introduces entry creation),
but if a dev DB has stray rows, clear them or `supabase db reset` before applying.

## References

- Roadmap slice: `context/foundation/roadmap.md` (S-02, North star)
- PRD: `context/foundation/prd.md` (US-01, US-03, FR-005–FR-008, FR-012, NFR-001; Business Logic
  formulas + threshold table)
- Data foundation: `supabase/migrations/20260530000002_create_sales_entries.sql`
- S-01 patterns: `context/changes/product-catalog-crud/plan.md`,
  `src/pages/api/products/index.ts`, `src/pages/api/products/[id].ts`,
  `src/lib/validation/product.ts`, `src/lib/db.ts`,
  `src/components/products/ProductCatalog.tsx`, `src/components/products/ProductForm.tsx`,
  `src/pages/products.astro`, `src/middleware.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Classification engine + Vitest harness

#### Automated

- [x] 1.1 Engine unit tests pass: `npm test` — 0fd601c
- [x] 1.2 Type checking passes: `npm run build` — 0fd601c
- [x] 1.3 Linting passes: `npm run lint` — 0fd601c
- [x] 1.4 Formatting passes: `npm run format` — 0fd601c

#### Manual

- [x] 1.5 Worked-example output matches the PRD threshold table (Understocked + Slow-mover spot-checks) — 0fd601c

### Phase 2: Overlap constraint, validation schema, db helpers, sales-entry API

#### Automated

- [x] 2.1 Migration applies cleanly: `npx supabase start` / `supabase db reset` with no errors
- [x] 2.2 Type checking passes: `npm run build`
- [x] 2.3 Linting passes: `npm run lint`
- [x] 2.4 Formatting passes: `npm run format`

#### Manual

- [x] 2.5 `POST` valid entry → `201` with entry + classification; row under correct user/product
- [x] 2.6 Overlapping `POST` → `409` clear message, no row inserted
- [x] 2.7 DB exclusion constraint rejects an overlapping insert made directly in Studio
- [x] 2.8 Future `end_date` / `units_sold <= 0` / `end < start` → `400` with issues
- [x] 2.9 `DELETE` → `200` recomputed classification; deleting to `< 7` days reverts to Insufficient data; unknown id → `404`
- [x] 2.10 No-session → `401`; foreign product id → `404` (isolation)

### Phase 3: Product detail page + sales-entry island

#### Automated

- [ ] 3.1 Type checking passes: `npm run build`
- [ ] 3.2 Linting passes: `npm run lint`
- [ ] 3.3 Formatting passes: `npm run format`
- [ ] 3.4 Engine tests still pass: `npm test`

#### Manual

- [ ] 3.5 `/products/[id]` while logged out redirects to `/auth/signin`
- [ ] 3.6 No-entry product shows "Insufficient data" + log-first prompt
- [ ] 3.7 Crossing 7 days flips to a real classification within ~1s, correct threshold + recommendation (Understocked "Order N units"; no-lead-time "Set lead time…")
- [ ] 3.8 Overlapping range shows the 409 message; no entry added
- [ ] 3.9 Deleting recalculates in place (~1s); deleting to `< 7` days reverts to Insufficient data
- [ ] 3.10 Slow-mover product shows "Consider promotion"
- [ ] 3.11 Catalog rows link to detail; back-link returns to `/products`
- [ ] 3.12 Two-account isolation: account B cannot open A's detail page or see A's entries
