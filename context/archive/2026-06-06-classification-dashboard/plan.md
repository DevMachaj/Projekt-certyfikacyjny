# Classification Dashboard (S-03) Implementation Plan

## Overview

Replace the placeholder `dashboard.astro` with the real classification dashboard:
all of the owner's products, grouped by classification state in the fixed PRD
order (Understocked → Watch → OK → Slow-mover → Insufficient data), alphabetical
within each group, each card showing the product name, its state badge, and the
specific recommended action. The classification math is unchanged — this slice
reuses S-02's `classify()` engine verbatim. The new engineering is (1) a batch
data layer that fetches every product and every sales entry for the user in two
queries (no per-product N+1 loop) and (2) the grouped server-rendered view.

## Current State Analysis

S-02 shipped a complete, working single-product classification flow. Everything
the dashboard computes already exists; nothing about the engine or schema changes.

- **Engine** — `classify(product, entries): ClassificationResult` at
  `src/lib/classification.ts:84`. Pure, server-side-only, dependency-free. Returns
  `.state` (the `ClassificationState` enum), `.recommendation` (a tagged union),
  velocity, daysOfStock, totalDays, totalUnits, thresholdLabel. This is the
  product IP and is the single source of truth for both the detail page and the
  dashboard.
- **DB helpers** — `src/lib/db.ts`. `getProductsByUser(supabase, userId)`
  (`db.ts:6`) returns products already ordered by `name` ascending — so
  within-group alphabetical sort is free if we preserve that order.
  `getSalesEntriesByProduct(supabase, productId)` (`db.ts:67`) exists but is
  **single-product** — using it in a loop is exactly the N+1 the roadmap flags.
  There is **no** per-user batch fetch of sales entries yet.
- **Shared display constants are trapped in a component** — `STATE_ORDER`
  (`ClassificationPanel.tsx:12`, identical to the PRD group order) and
  `STATE_STYLES` (`ClassificationPanel.tsx:14`, per-state Tailwind badge classes)
  are local `const`s inside the React detail-panel component. The recommendation
  wording lives in `recommendationLine()` (`ClassificationPanel.tsx:22`), which
  returns JSX `{icon, text}` and so is **not reusable from an Astro page**.
- **Current dashboard** — `src/pages/dashboard.astro` is a placeholder: a welcome
  card with the user email, a "Manage products" link to `/products`, and a
  sign-out form. `Astro.locals.user` is populated by the middleware route guard;
  `/dashboard` is already in `PROTECTED_ROUTES`.
- **Rendering pattern** — pages are SSR Astro; the detail page
  (`src/pages/products/[id].astro`) runs `classify()` in frontmatter and hands the
  result to a React island only because the detail page is interactive (add/delete
  entries). The dashboard is view-plus-click-through only — no island needed.
- **Test harness** — Vitest is configured (S-02 added it); `classify()` has a unit
  suite. A pure grouping helper fits the same harness.
- **shadcn/ui available** — `button.tsx`, `dialog.tsx` in `src/components/ui/`.

### Key Discoveries:

- `getProductsByUser` already sorts by name (`db.ts:11`) → alphabetical-within-group
  requires no extra sort, just stable iteration in that order.
- `STATE_ORDER` (`ClassificationPanel.tsx:12`) is byte-for-byte the FR-009 group
  order — extracting it to the engine module makes one canonical order both views share.
- The recommendation **text** must be derived from the same logic the detail panel
  uses, but `recommendationLine()` returns JSX — the text branch must be split out
  into a pure, framework-agnostic function so the Astro card can call it.
- RLS + `getProductsByUser`/the batch helper both filter by `user_id`; per-account
  isolation (NFR-003) is enforced by the same query+RLS layer S-02 already relies on.

## Desired End State

Navigating to `/dashboard` shows the owner's whole catalog grouped by
classification state. Only states that contain at least one product render, in the
fixed order; within each, products appear alphabetically. Each card shows the
product name, the colored state badge, and the recommended action line ("Order 12
units" / "Consider promotion" / "Set lead time to get reorder suggestion" / etc.),
and links to that product's `/products/[id]` detail page. A brand-new owner with no
products sees a friendly empty state with a button to add their first product. The
existing "Manage products" link and sign-out action remain. The page issues exactly
two Supabase queries regardless of catalog size.

**Verify:** With seeded products spanning several states, `/dashboard` shows them
in the right groups and order, empty states are hidden, each card's
recommendation matches the detail page for that product, and the network panel
shows two domain queries (products + sales entries), not N+1.

## What We're NOT Doing

- **No classification on the `/products` catalog list** — it stays the plain CRUD
  management screen S-02 intentionally left it as. Dashboard is the dedicated
  classification surface. (Confirmed scope decision.)
- **No React island / client interactivity on the dashboard** — no in-place editing,
  filtering, or sorting controls. Pure SSR.
- **No changes to the engine, schema, types, product CRUD, or sales-entry flow** —
  `classify()`, `Product`, `SalesEntry`, migrations, and the detail page behavior
  are untouched (apart from the no-behavior-change constant extraction in Phase 1).
- **No new classification states, thresholds, or recommendation kinds.**
- **No pagination / virtualization** — out of scope at MVP data volumes; the batch
  query is the performance answer FR/NFR-001 needs here.

## Implementation Approach

Data layer first, then the view. Phase 1 adds the one missing query
(`getSalesEntriesByUser`), lifts the shared constants/wording out of the React
component into framework-agnostic modules (so the Astro page and the React panel
draw from one source and cannot drift), and adds a pure, unit-tested
`groupProductsByState()` helper. Phase 2 rewrites `dashboard.astro` to batch-fetch,
group entries by `product_id` in memory, `classify()` each product, group by state,
and render the grouped cards with the empty-state and nav affordances.

Grouping/sorting is done server-side in plain TS — the engine runs server-side
only (it is the product IP), and grouping is a trivial pure transform that belongs
next to it and is cheap to test.

## Critical Implementation Details

- **Avoiding N+1 (the roadmap's named risk):** fetch all entries for the user in
  one query, then build a `Map<product_id, SalesEntry[]>` in memory and look each
  product's entries up from it. Do **not** call `getSalesEntriesByProduct` per
  product. With products + entries that is two queries total, independent of
  catalog size — the design NFR-001 depends on as the catalog grows.
- **Within-group order is free:** `getProductsByUser` returns products name-sorted;
  if `groupProductsByState` iterates products in input order and appends into each
  bucket, every bucket stays alphabetical without a second sort. (The helper should
  still not _reorder_ — it must preserve input order — so the contract is "input is
  pre-sorted by name.")
- **Recommendation wording must not fork:** the detail panel and the dashboard card
  must show identical action text. Extract the text into a pure
  `recommendationText(recommendation, state): string`; the panel keeps its icons
  but sources the words from that function. A second copy of the wording is a latent
  drift bug.

## Phase 1: Data layer + shared constants

### Overview

Add the batch query, lift the shared order/style/wording out of the React panel
into framework-agnostic modules with no behavior change, and add a pure,
unit-tested grouping helper. No UI changes land in this phase.

### Changes Required:

#### 1. Batch sales-entry query

**File**: `src/lib/db.ts`

**Intent**: Add a helper that fetches every sales entry belonging to a user in one
round-trip, so the dashboard can avoid a per-product query loop.

**Contract**: `export async function getSalesEntriesByUser(supabase: SupabaseClient, userId: string): Promise<SalesEntry[]>` — selects all `sales_entries` rows filtered by `user_id`, ordered by `start_date` ascending (mirrors `getSalesEntriesByProduct`'s shape/throw-on-error convention at `db.ts:67`). RLS already scopes by user; the explicit `eq("user_id", ...)` matches the existing helpers.

#### 2. Lift canonical state order + recommendation wording into the engine module

**File**: `src/lib/classification.ts`

**Intent**: Make the fixed state order and the recommendation action text canonical
in the engine module so every view (detail panel, dashboard) shares one source.

**Contract**: Add `export const STATE_ORDER: ClassificationState[]` with the value currently at `ClassificationPanel.tsx:12` (`["Understocked", "Watch", "OK", "Slow-mover", "Insufficient data"]`). Add `export function recommendationText(rec: Recommendation, state: ClassificationState): string` returning the plain-text action line — the same strings produced by `recommendationLine()` today (`"Order ${units} units"`, `"Consider promotion"`, `"Set lead time to get reorder suggestion"`, and the two `none` branches keyed on `state === "Insufficient data"`). No icons here — text only. Engine stays pure (types + these constants only).

#### 3. Shared badge styles module

**File**: `src/lib/classification-ui.ts` (new)

**Intent**: Hold the per-state Tailwind badge classes so both the React panel and
the Astro dashboard import one definition.

**Contract**: `export const STATE_STYLES: Record<ClassificationState, string>` with the values currently at `ClassificationPanel.tsx:14-20`. Presentation-only constants (kept out of the pure engine module deliberately).

#### 4. Refactor ClassificationPanel to consume the shared definitions

**File**: `src/components/sales/ClassificationPanel.tsx`

**Intent**: Remove the now-duplicated local constants and wording so the panel and
dashboard cannot drift; behavior and rendered output stay identical.

**Contract**: Delete the local `STATE_ORDER` and `STATE_STYLES`; import them from `@/lib/classification` and `@/lib/classification-ui`. Keep `recommendationLine()` but have its `text` come from `recommendationText()` (icons stay local to the component). No visible change to the detail page.

#### 5. Pure grouping helper

**File**: `src/lib/dashboard.ts` (new)

**Intent**: Turn a name-sorted product list plus its entries-by-product into the
ordered, non-empty groups the dashboard renders — pure and unit-testable.

**Contract**: Define a small item type pairing a product with its `ClassificationResult` and export `function groupProductsByState(items: ProductClassification[]): { state: ClassificationState; items: ProductClassification[] }[]`. Returns groups in `STATE_ORDER`, **omitting** states with zero items, preserving input order within each group (caller passes products already name-sorted). Pure — no Supabase, no `classify` call inside (caller classifies); takes already-classified items so it is trivially testable. (A thin convenience that maps products→classified items may live in the dashboard page itself or alongside; keep the grouping function itself dependency-free.)

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run build` (or `tsc` via the build)
- Linting passes: `npm run lint`
- Unit tests pass: `npx vitest run` — including new `groupProductsByState` tests covering: fixed-order output, empty groups omitted, alphabetical/input order preserved within a group, and an all-empty input returning `[]`.

#### Manual Verification:

- The product detail page (`/products/[id]`) renders exactly as before — badge colors, state order in the legend, and recommendation wording unchanged after the constant extraction.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation that the detail page is visually unchanged before proceeding to Phase 2.

---

## Phase 2: Dashboard page

### Overview

Rewrite `dashboard.astro` to batch-fetch the catalog, classify each product, group
by state, and render the grouped cards with the empty state and existing nav.

### Changes Required:

#### 1. Dashboard product card

**File**: `src/components/dashboard/ProductCard.astro` (new)

**Intent**: Render a single product card — name, state badge, recommended action —
as a link to the product's detail page.

**Contract**: Props `{ product: Product; classification: ClassificationResult }`. Renders an `<a href={`/products/${product.id}`}>` card showing `product.name`, a badge styled via `STATE_STYLES[classification.state]` (imported from `@/lib/classification-ui`) labeled with the state, and the action line from `recommendationText(classification.recommendation, classification.state)`. Tailwind styling consistent with the existing cosmic/glass look in `dashboard.astro` and `ClassificationPanel`.

#### 2. Dashboard page

**File**: `src/pages/dashboard.astro`

**Intent**: Replace the placeholder body with the grouped classification view built
from two batch queries; keep the page header actions.

**Contract**: In frontmatter: get `user` from `Astro.locals` and the SSR Supabase client; call `getProductsByUser` and `getSalesEntriesByUser`; build `Map<product_id, SalesEntry[]>` from the entries; `classify(product, map.get(product.id) ?? [])` for each product; pass the classified items through `groupProductsByState`. Render: when there are no products, an empty-state panel with a "Add your first product" button linking to `/products`; otherwise one section per non-empty group — a heading with the state name, then its `ProductCard`s. Retain the "Manage products" link and the sign-out form from the current page. Uses `Layout`. No React island, no `client:*` directive. **Must not** import `classify`/engine into any client component — it stays server-side.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run build`
- Linting passes: `npm run lint`
- Existing unit tests still pass: `npx vitest run`

#### Manual Verification:

- With products spanning multiple states, `/dashboard` shows groups in the fixed
  order Understocked → Watch → OK → Slow-mover → Insufficient data, alphabetical
  within each group, and states with no products are not shown.
- Each card's recommended action matches that product's `/products/[id]` detail page.
- A new account (no products) sees the empty-state with a working "add product" CTA.
- "Manage products" and "Sign out" both work from the dashboard.
- Network/devtools shows two domain queries (products + sales entries), not one per
  product (N+1 check).
- A second account cannot see the first account's products on its dashboard
  (NFR-003 isolation spot-check).

**Implementation Note**: After completing this phase and all automated verification
passes, pause for manual confirmation of the above before considering the change done.

---

## Testing Strategy

### Unit Tests:

- `groupProductsByState` (new, Vitest): fixed-order output; empty groups omitted;
  input (alphabetical) order preserved within each group; all-empty input → `[]`;
  every state populated → all five groups in order.

### Integration / Manual Testing Steps:

1. Seed one product per state (use known stock/lead/buffer + entries that land each
   threshold) plus one "Insufficient data" product (< 7 days history).
2. Load `/dashboard`; confirm group order, within-group alphabetical order, and that
   no empty-state headers appear.
3. Open one card's detail page; confirm the recommendation text is identical.
4. Delete all products (or use a fresh account); confirm the empty-state CTA renders.
5. Confirm the network panel shows two domain queries regardless of product count.
6. Sign in as a second account; confirm none of the first account's products appear.

## Performance Considerations

The whole point of the two-query design is NFR-001 as the catalog grows: products
in one query, all sales entries in a second, grouped in memory — O(products +
entries) work, constant query count. At MVP data volumes this is comfortably within
the 1-second budget. No caching needed.

## Migration Notes

None — no schema or data changes. Pure application code.

## References

- Roadmap slice: `context/foundation/roadmap.md` (S-03, FR-009)
- PRD: `context/foundation/prd.md` (FR-009 dashboard, NFR-001 perf, NFR-003 isolation)
- Engine reused as-is: `src/lib/classification.ts:84` (`classify`)
- Constants being lifted: `src/components/sales/ClassificationPanel.tsx:12` (`STATE_ORDER`), `:14` (`STATE_STYLES`), `:22` (`recommendationLine`)
- Batch query sibling pattern: `src/lib/db.ts:67` (`getSalesEntriesByProduct`)
- S-02 plan (upstream context): `context/changes/sales-entry-and-classification/plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data layer + shared constants

#### Automated

- [x] 1.1 Type checking passes: `npm run build` — f76a54c
- [x] 1.2 Linting passes: `npm run lint` — f76a54c
- [x] 1.3 Unit tests pass incl. new `groupProductsByState` suite: `npx vitest run` — f76a54c

#### Manual

- [x] 1.4 Product detail page renders unchanged after constant extraction — f76a54c

### Phase 2: Dashboard page

#### Automated

- [x] 2.1 Type checking passes: `npm run build` — 6a5f2b2
- [x] 2.2 Linting passes: `npm run lint` — 6a5f2b2
- [x] 2.3 Existing unit tests still pass: `npx vitest run` — 6a5f2b2

#### Manual

- [x] 2.4 Groups render in fixed order, alphabetical within group, empty groups hidden — 6a5f2b2
- [x] 2.5 Each card's recommendation matches the detail page — 6a5f2b2
- [x] 2.6 New account sees the empty-state CTA — 6a5f2b2
- [x] 2.7 "Manage products" and "Sign out" work from the dashboard — 6a5f2b2
- [x] 2.8 Two domain queries, not N+1 — 6a5f2b2
- [x] 2.9 Second account cannot see the first account's products (NFR-003) — 6a5f2b2
