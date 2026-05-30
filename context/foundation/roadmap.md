---
project: StockHelper
version: 1
status: draft
created: 2026-05-30
updated: 2026-05-30
prd_version: 1
main_goal: market-feedback
top_blocker: capacity
---

# Roadmap: StockHelper

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

Small e-commerce store owners have sales history in their shop platforms (Shopify, WooCommerce, Etsy) but must interpret it themselves — comparing raw totals against memory to decide whether to reorder or promote. StockHelper inserts the missing interpretation step: it classifies each product's velocity (the rate at which it sells relative to current stock and lead time) and converts that classification into a specific recommended action ("Order X units" or "Consider promotion"). The product differentiator — the single trait that, if removed, would make StockHelper indistinguishable from a spreadsheet with more steps — is the classification rule itself: fast-or-slow relative to this product's own history, stock level, and lead time, not a generic chart. The sequencing goal is market-feedback — getting the end-to-end classification loop in front of a real owner as quickly as possible to validate whether the interpretation step is genuinely useful, as opposed to just another view of data the owner already has.

## North star

**S-02: owner can log a sales entry for a product and see the resulting velocity classification and recommended action** — the smallest end-to-end slice whose successful delivery proves the core product hypothesis (the claim that turning raw sales data into a classified state plus a specific recommendation is meaningfully better than a spreadsheet). If this slice works correctly for one product, the primary success criterion is satisfied and the product has earned the right to invest in the dashboard.

> "North star" in this roadmap means: the smallest complete slice that, if shipped and used by a real owner, proves the product's core value. It is placed as early as its prerequisites allow because all other slices only matter if the classification engine works.

## At a glance

| ID   | Change ID                      | Outcome (user can …)                                                          | Prerequisites | PRD refs                                              | Status   |
| ---- | ------------------------------ | ----------------------------------------------------------------------------- | ------------- | ----------------------------------------------------- | -------- |
| F-01 | supabase-schema-and-types      | (foundation) schema + RLS policies + domain types in place                    | —             | NFR-003, FR-001, FR-002, FR-003, FR-005               | ready    |
| S-01 | product-catalog-crud           | add, edit, and delete products in their catalog                               | F-01          | US-02, FR-003, FR-004, FR-011                         | proposed |
| S-02 | sales-entry-and-classification | log and delete sales entries and see the classification + recommendation       | F-01, S-01    | US-01, US-03, FR-005, FR-006, FR-007, FR-008, FR-012  | proposed |
| S-03 | classification-dashboard       | view all products grouped by classification state on the dashboard            | S-02          | FR-009                                                | proposed |

## Baseline

What's already in place in the codebase as of 2026-05-30 (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Astro 6.3.1 + React islands wired; auth pages functional (`src/pages/auth/signin.astro`); shadcn/ui component set bootstrapped (`src/components/ui/button.tsx`)
- **Backend / API:** partial — auth routes fully implemented (`src/pages/api/auth/{signin,signup,signout}.ts`); zero domain routes (products, sales entries, classification)
- **Data:** partial — Supabase SDK + SSR client configured (`src/lib/supabase.ts`); no schema migrations; no domain entity types in `src/types.ts`
- **Auth:** present — Supabase auth fully wired: session cookies, middleware route guard (`src/middleware.ts`), sign-in/sign-up/sign-out API routes, protected `/dashboard` redirect. FR-001 (account registration) and FR-002 (login/logout) are satisfied by this existing layer; no roadmap item is needed for auth itself.
- **Deploy / infra:** present — `wrangler.jsonc` (Cloudflare Workers), `.github/workflows/ci.yml`, `.env.example`
- **Observability:** absent — no logging library, no error tracking, no health check endpoint

## Foundations

### F-01: Supabase schema and domain types

- **Outcome:** (foundation) `products` and `sales_entries` tables exist in Supabase with row-level security (RLS) policies enforcing per-user data isolation; TypeScript domain entity types declared in `src/types.ts`; Supabase client query patterns for domain reads established as a reference for downstream slices.
- **Change ID:** supabase-schema-and-types
- **PRD refs:** NFR-003 (data isolation — "an absolute property, not best-effort"; RLS is the enforcement mechanism), FR-003 (product fields define the `products` table columns), FR-005 (sales entry fields define the `sales_entries` table columns), FR-001 and FR-002 (auth already present; F-01's RLS policies complete the data-isolation contract these requirements depend on)
- **Unlocks:** S-01 (requires the `products` table), S-02 (requires the `sales_entries` table and RLS policies), S-03 (queries both tables for the dashboard grouping)
- **Prerequisites:** —
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Schema decisions (column types for `start_date`/`end_date` in `sales_entries`, whether `lead_time_days` is nullable, cascade-delete behavior from `products` → `sales_entries`) propagate to all downstream slices; an incorrect schema requires a Supabase migration plus a type refactor across the codebase. Sequenced first to contain this risk before any domain logic is written.
- **Status:** ready

## Slices

### S-01: Product catalog CRUD

- **Outcome:** owner can add, edit, and delete products in their catalog (name, stock quantity, lead time in days, buffer days), with each change reflected immediately; no other account can see their products.
- **Change ID:** product-catalog-crud
- **PRD refs:** US-02 (add, edit, delete a product; classification updates on each change), FR-003 (add product with name, stock quantity, lead time, buffer days with default 7), FR-004 (view and edit any product field; classification recalculates on save), FR-011 (delete product with confirmation prompt; all associated sales entries permanently removed)
- **Prerequisites:** F-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Cascade-delete behavior (FR-011: deleting a product must remove all associated sales entries) must be implemented at the database level (foreign key cascade) or explicitly in the API handler; misimplementation risks orphaned `sales_entries` rows that later classification queries silently pick up, producing wrong velocity calculations.
- **Status:** proposed

### S-02: Sales entry logging and velocity classification *(North star)*

- **Outcome:** owner can log one or more non-overlapping sales entries (units sold, start date, end date) for a product — with overlapping ranges rejected — and immediately see the resulting velocity classification (Understocked / Watch / OK / Slow-mover / Insufficient data) with the threshold definition for that state and the specific recommended action ("Order X units" / "Consider promotion" / "Set lead time to get reorder suggestion"); owner can also delete a sales entry and see the classification recalculate immediately.
- **Change ID:** sales-entry-and-classification
- **PRD refs:** US-01 (log sales entries, see classification and recommendation; updates within 1 second), US-03 (delete a wrong entry; classification recalculates; reverts to "Insufficient data" if < 7 days remain), FR-005 (log sales entry; reject overlapping date ranges), FR-006 (classification display with visible threshold definition per state), FR-007 (recommended action: "Order X units" where X = velocity × (lead_time + buffer_days), or "Consider promotion" for Slow-movers, or "Set lead time to get reorder suggestion" if lead time unset), FR-008 ("Insufficient data" state when < 7 days of non-overlapping history; clears automatically when threshold met), FR-012 (delete a sales entry)
- **Prerequisites:** F-01, S-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Where should date-range overlap validation live — database constraint, API-layer check, or both? Owner: developer. Block: no (PRD specifies the outcome clearly; the implementation decision belongs to `/10x-plan`).
- **Risk:** The overlap validation (FR-005) is the trickiest implementation detail in the PRD — a gap silently corrupts the velocity calculation that all classification thresholds depend on. NFR-001 requires classification to update within 1 second; the computation is arithmetic but the full Supabase round-trip (write entry → re-query all entries → compute velocity → render) must fit within that window.
- **Status:** proposed

### S-03: Classification dashboard

- **Outcome:** owner can view all of their products grouped by classification state in the fixed order (Understocked → Watch → OK → Slow-mover → Insufficient data), sorted alphabetically within each group, on the dashboard page.
- **Change ID:** classification-dashboard
- **PRD refs:** FR-009 (dashboard grouped by classification state; fixed group order; alphabetical within each group)
- **Prerequisites:** S-02
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Low implementation risk — the grouping and sort order are fully specified in the PRD. The main risk is query design: fetching all products with their current classification in a single efficient query (or a predictable set of queries) rather than N+1 per product; this matters for the 1-second NFR-001 constraint as the catalog grows.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID                      | Suggested issue title                                              | Ready for `/10x-plan` | Notes                                    |
| ---------- | ------------------------------ | ------------------------------------------------------------------ | --------------------- | ---------------------------------------- |
| F-01       | supabase-schema-and-types      | Schema: products + sales_entries tables with RLS                   | yes                   | Run `/10x-plan supabase-schema-and-types` |
| S-01       | product-catalog-crud           | Feature: product catalog — add / edit / delete                     | no                    | Requires F-01 to be done first            |
| S-02       | sales-entry-and-classification | Feature: sales entry logging + velocity classification (north star) | no                   | Requires F-01 + S-01 to be done first    |
| S-03       | classification-dashboard       | Feature: dashboard grouped by classification state                 | no                    | Requires S-02 to be done first            |

## Open Roadmap Questions

None — all product questions were resolved during shaping (PRD v1 `## Open Questions`: none). The date-range overlap validation implementation decision (API layer vs. database constraint vs. both) is an Unknown in S-02 with Block: no — it does not require resolution before S-02 is planned; `/10x-plan` resolves it during detailed planning.

## Parked

- **Shop platform integrations (Shopify / WooCommerce / Etsy API sync)** — Why parked: PRD §Non-Goals; sales data is entered manually at MVP.
- **Multi-store management (switch-store UI, cross-store aggregates)** — Why parked: PRD §Non-Goals; one account maps to one store at MVP.
- **Demand forecasting (future velocity projections, seasonal curves)** — Why parked: PRD §Non-Goals; StockHelper classifies current inventory state only, no prediction.
- **Purchasing action execution (purchase orders, supplier emails, procurement integrations)** — Why parked: PRD §Non-Goals; the app generates a recommendation only.
- **Mobile layout** — Why parked: PRD §Non-Goals; desktop browsers only at MVP.

## Done

(Empty on first generation. `/10x-archive` appends an entry here — and flips that item's `Status` to `done` — when a change whose `Change ID` matches a roadmap item is archived.)
