---
project: StockHelper
version: 1
status: draft
created: 2026-05-30
updated: 2026-07-25
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

| ID   | Change ID                           | Outcome (user can …)                                                                                                                                                                              | Prerequisites | PRD refs                                             | Status        |
| ---- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ---------------------------------------------------- | ------------- |
| F-01 | supabase-schema-and-types           | (foundation) schema + RLS policies + domain types in place                                                                                                                                        | —             | NFR-003, FR-001, FR-002, FR-003, FR-005              | done          |
| S-01 | product-catalog-crud                | add, edit, and delete products in their catalog                                                                                                                                                   | F-01          | US-02, FR-003, FR-004, FR-011                        | done          |
| S-02 | sales-entry-and-classification      | log and delete sales entries and see the classification + recommendation                                                                                                                          | F-01, S-01    | US-01, US-03, FR-005, FR-006, FR-007, FR-008, FR-012 | impl_reviewed |
| S-03 | classification-dashboard            | view all products grouped by classification state on the dashboard                                                                                                                                | S-02          | FR-009                                               | impl_reviewed |
| S-04 | ai-weekly-restocking-plan           | click a button to get one AI-generated weekly restocking summary                                                                                                                                  | S-03          | US-01, FR-006, FR-007                                | impl_reviewed |
| S-05 | restocking-plan-decision-support    | get a prioritized, explained weekly restocking decision (not just a restatement)                                                                                                                  | S-04          | US-01, FR-006, FR-007                                | done          |
| S-06 | ux-improvements                     | bulk-action a candidate review, reset a review session, see clear loading states                                                                                                                  | F-01          | NFR-001                                              | done          |
| S-07 | account-deletion-and-data-retention | delete their account (hard delete; F-01 cascade wipes products + sales entries)                                                                                                                   | F-01          | NFR-003, FR-001, FR-002                              | done          |
| S-08 | design-system-refresh               | see a refreshed visual design system (color / typography / spacing tokens) applied to the shared shadcn/ui base components                                                                        | —             | NFR-002                                              | ready         |
| S-09 | screens-restyle                     | see the refreshed design applied across existing screens (dashboard, products, forms)                                                                                                             | S-08          | NFR-001, NFR-002                                     | proposed      |
| S-10 | landing-page                        | land on a real public landing page (hero, how-it-works, CTA) at `/`, with logged-in users redirected to `/dashboard`                                                                              | S-08          | NFR-002                                              | proposed      |
| S-11 | app-shell-nav                       | navigate via a persistent left sidebar (Dashboard / Produkty / Plan zatowarowania, active state, live Understocked badge, account card) and open the full weekly restocking plan on its own route | S-09          | US-01, FR-006, FR-007, FR-009, NFR-002               | proposed      |
| S-12 | dashboard-redesign                  | see the dashboard as grouped state Cards (Badge + count + threshold definition) with rich product rows (stock / velocity / days-of-stock / reorder qty) and a restock-plan teaser                 | S-11          | FR-006, FR-007, FR-009, NFR-002                      | proposed      |

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
- **Status:** done

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
- **Status:** done

### S-02: Sales entry logging and velocity classification _(North star)_

- **Outcome:** owner can log one or more non-overlapping sales entries (units sold, start date, end date) for a product — with overlapping ranges rejected — and immediately see the resulting velocity classification (Understocked / Watch / OK / Slow-mover / Insufficient data) with the threshold definition for that state and the specific recommended action ("Order X units" / "Consider promotion" / "Set lead time to get reorder suggestion"); owner can also delete a sales entry and see the classification recalculate immediately.
- **Change ID:** sales-entry-and-classification
- **PRD refs:** US-01 (log sales entries, see classification and recommendation; updates within 1 second), US-03 (delete a wrong entry; classification recalculates; reverts to "Insufficient data" if < 7 days remain), FR-005 (log sales entry; reject overlapping date ranges), FR-006 (classification display with visible threshold definition per state), FR-007 (recommended action: "Order X units" where X = velocity × (lead_time + buffer_days), or "Consider promotion" for Slow-movers, or "Set lead time to get reorder suggestion" if lead time unset), FR-008 ("Insufficient data" state when < 7 days of non-overlapping history; clears automatically when threshold met), FR-012 (delete a sales entry)
- **Prerequisites:** F-01, S-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Where should date-range overlap validation live — database constraint, API-layer check, or both? Owner: developer. Block: no (PRD specifies the outcome clearly; the implementation decision belongs to `/10x-plan`).
- **Risk:** The overlap validation (FR-005) is the trickiest implementation detail in the PRD — a gap silently corrupts the velocity calculation that all classification thresholds depend on. NFR-001 requires classification to update within 1 second; the computation is arithmetic but the full Supabase round-trip (write entry → re-query all entries → compute velocity → render) must fit within that window.
- **Status:** impl_reviewed

### S-03: Classification dashboard

- **Outcome:** owner can view all of their products grouped by classification state in the fixed order (Understocked → Watch → OK → Slow-mover → Insufficient data), sorted alphabetically within each group, on the dashboard page.
- **Change ID:** classification-dashboard
- **PRD refs:** FR-009 (dashboard grouped by classification state; fixed group order; alphabetical within each group)
- **Prerequisites:** S-02
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Low implementation risk — the grouping and sort order are fully specified in the PRD. The main risk is query design: fetching all products with their current classification in a single efficient query (or a predictable set of queries) rather than N+1 per product; this matters for the 1-second NFR-001 constraint as the catalog grows.
- **Status:** impl_reviewed

### S-04: AI weekly restocking plan

- **Outcome:** owner can click a button and get one AI-generated weekly restocking summary of what to reorder, built from the products the deterministic engine has already classified as Understocked or Watch. The engine still makes the business decision (which products need restocking and the recommended quantity); the AI only summarizes those existing recommendations into a single readable weekly plan.
- **Change ID:** ai-weekly-restocking-plan
- **PRD refs:** US-01 (the classification + recommendation the summary is built from), FR-006 (the Understocked / Watch classification states that select which products enter the summary), FR-007 (the recommended action — "Order X units" — the summary restates per product)
- **Prerequisites:** S-03
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** First slice that integrates an LLM. The deterministic engine still makes the business decision — which products are Understocked/Watch and the reorder quantity — and the AI only summarizes that existing output, so a bad or hallucinated LLM response can mislead the wording of the summary but cannot corrupt the underlying recommendation or classification.
- **Status:** impl_reviewed

### S-05: Restocking plan decision support

- **Outcome:** the AI weekly restocking plan now **prioritizes and explains** instead of merely restating the engine's output — the deterministic engine orders restock candidates by urgency and computes the supporting facts, and the AI adds a weekly headline plus a one-line "why" per product. Quantities, states, actions, selection, and ordering stay engine-authoritative; the AI contributes prose only, with a deterministic-reason fallback when the LLM is unavailable. Enhancement to S-04.
- **Change ID:** restocking-plan-decision-support
- **PRD refs:** US-01 (the restocking decision the plan now supports rather than restates), FR-006 (the Understocked / Watch states that select candidates), FR-007 (the recommended action / quantity the plan prioritizes and explains)
- **Prerequisites:** S-04
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** The engine remains the sole author of which products to restock, the quantities, and the ordering; the AI only adds prose, so a bad or hallucinated LLM response can degrade the wording of the headline or "why" line but cannot corrupt the recommendation, selection, or order. The deterministic fallback keeps the panel strictly better than the dashboard tiles when the LLM is unavailable.
- **Status:** done

### S-06: UX improvements

- **Outcome:** owner can apply bulk actions during candidate review (instead of one-at-a-time), reset a review session to start over, and see clear loading states while data is fetching — closing three friction points observed while building S-01 through S-04.
- **Change ID:** ux-improvements
- **PRD refs:** NFR-001 (perceived responsiveness — explicit loading states keep the UI legible while the sub-1-second update completes). The bulk-action and reset-session gaps are field-discovered UX needs, not in PRD v1.
- **Prerequisites:** F-01
- **Parallel with:** S-07 — **fully parallel** (both depend only on F-01 and are independent of the core classification/restocking sequence; S-07's hard-delete decision means no shared contract or migration between them)
- **Blockers:** —
- **Unknowns:**
  - Which screens get bulk actions and what the action set is (e.g. bulk delete) — Owner: developer. Block: no (`/10x-plan` scopes the surface).
- **Risk:** Low — surface-level UX work with no schema or classification-engine changes. The main risk is scope creep: "UX improvements" is broad, so the plan should fix the action set to the three observed gaps (bulk actions, session reset, loading states) and defer anything else to the backlog.
- **Status:** done

### S-07: Account deletion and data retention

- **Outcome:** owner can permanently delete their account via a **hard delete** — deleting the `auth.users` row, relying on the existing F-01 `ON DELETE CASCADE` (`products.user_id` and `sales_entries.user_id` → `auth.users`) to wipe all associated data. No soft delete, no `deleted_at` columns, no retention window. A separate project area from the classification / restocking core — it concerns the account lifecycle, not velocity logic.
- **Change ID:** account-deletion-and-data-retention
- **PRD refs:** NFR-003 (data isolation — deletion is the end-of-lifecycle half of the same per-user data contract), FR-001 / FR-002 (account lifecycle the deletion path extends). The account-deletion flow is not specified in PRD v1; this slice introduces it.
- **Prerequisites:** F-01
- **Parallel with:** S-06 — **fully parallel.** With hard delete decided, S-07 adds no migration and no domain-table/`types.ts` change, so it shares no contract with S-06. The only potential overlap is an append to `src/lib/db.ts` (trivial), avoidable if S-06 does bulk-delete client-side over the existing `/api/products/[id]` DELETE.
- **Blockers:** —
- **Unknowns:**
  - ~~Retention policy: hard delete vs. soft delete~~ — **RESOLVED: hard delete.** Delete the `auth.users` row and let the existing F-01 cascade remove `products` + `sales_entries`. No new migration, no `deleted_at`, no retention window. This keeps the data model unchanged and removes the only cross-slice coupling with S-06.
- **Risk:** Account deletion is destructive and irreversible. Two narrower risks remain now that the model is fixed: (1) the delete must run with a **service-role** Supabase client (the `auth.users` admin delete is not available to the anon/SSR client), which means a new `SUPABASE_SERVICE_ROLE_KEY` secret in `astro.config.mjs` + Cloudflare + `.dev.vars`; (2) the cascade must be verified end-to-end so no `products`/`sales_entries` rows are orphaned. Both are bounded and testable.
- **Status:** done

### S-08: Design system refresh

- **Outcome:** owner sees a refreshed, coherent visual identity — a new set of design tokens (color, typography, spacing) applied to the shared shadcn/ui base components (`src/components/ui/`) so every downstream screen inherits the new look automatically. **Visual layer only** — no logic, API, data, or classification-engine changes.
- **Change ID:** design-system-refresh
- **PRD refs:** NFR-002 (browser support — refreshed tokens/components must render correctly on the latest two versions of Chrome, Firefox, Safari, Edge; desktop only). Note: a design-system refresh is presentation-layer work **not specified in PRD v1** — like S-06 and S-07, this is a field-discovered UX need, not a new product requirement.
- **Prerequisites:** —
- **Parallel with:** — (it is the head of the UI-refresh chain; S-09 and S-10 both consume it)
- **Blockers:** —
- **Unknowns:**
  - Token surface + naming: which token categories to define and how to wire them into Tailwind 4 / shadcn theming — Owner: developer. Block: no (`/10x-plan` scopes the token set and the theming mechanism).
- **Risk:** Because the tokens flow into the shared base components, a token or component-variant change propagates to every screen at once. That is the point (single source of truth) but also the risk: an unreviewed contrast or spacing change can regress legibility everywhere. Kept strictly visual (no markup/role changes) so it cannot alter behavior; screen-level application is deferred to S-09.
- **Status:** ready

### S-09: Screens restyle

- **Outcome:** owner sees the S-08 design applied across the existing screens — dashboard, product catalog, and the sales-entry / product forms — so the refreshed identity reaches the actual product surfaces, not just the component library. **Accessible names and roles stay stable** (headings, labels, button/link roles unchanged) so the E2E suite's `getByRole` / `getByLabel` locators keep passing.
- **Change ID:** screens-restyle
- **PRD refs:** NFR-001 (perceived responsiveness — the restyle must not regress the sub-1-second update or hide loading states), NFR-002 (browser support). Note: applies S-08's visual layer to existing screens; **not a new PRD requirement** (field-discovered, same class as S-06).
- **Prerequisites:** S-08
- **Parallel with:** S-10 (both depend only on S-08 and neither blocks the other; separate agent runs can take them in parallel)
- **Blockers:** —
- **Unknowns:**
  - Screen inventory: exact list of screens/components in scope beyond dashboard + products + forms (e.g. auth pages, restocking panel) — Owner: developer. Block: no (`/10x-plan` fixes the surface).
- **Risk:** The dominant risk is regressing E2E stability — restyling that renames or removes accessible names/roles silently breaks `getByRole`/`getByLabel` locators (see CLAUDE.md E2E rules). The slice's guardrail — keep accessible names/roles stable, change only visuals — is what contains it; the restyle should be verifiable as "pixels moved, accessibility tree unchanged."
- **Status:** proposed

### S-10: Landing page

- **Outcome:** the default `/` home route is replaced with a real public landing page (hero, how-it-works, call-to-action) instead of the current default/placeholder. `/` **stays public** (not added to `PROTECTED_ROUTES` in `src/middleware.ts`): unauthenticated visitors see the landing page, and authenticated visitors are redirected to `/dashboard`.
- **Change ID:** landing-page
- **PRD refs:** NFR-002 (browser support — desktop-only landing, consistent with the parked "Mobile layout" non-goal). Note: a marketing/landing surface is **not in PRD v1**; it touches the Access Control routing contract (public vs. redirect) but adds no new auth or domain logic.
- **Prerequisites:** S-08
- **Parallel with:** S-09 (both depend only on S-08 and are independent of each other)
- **Blockers:** —
- **Unknowns:**
  - Redirect mechanism: where the logged-in → `/dashboard` redirect lives (middleware vs. page-level guard) given `/` must remain outside `PROTECTED_ROUTES` — Owner: developer. Block: no (`/10x-plan` resolves the routing approach).
  - Landing copy/content source: whether hero/how-it-works copy is authored now or stubbed — Owner: developer. Block: no.
- **Risk:** The routing contract is the trap: `/` must be reachable by anonymous users (so it cannot go in `PROTECTED_ROUTES`), yet logged-in users must not see the marketing page. A naive guard that protects `/` locks anonymous visitors out of the landing entirely; a missing redirect shows logged-in owners the marketing page instead of their dashboard. The redirect must be conditional on session, not on route protection.
- **Status:** proposed

### S-11: App shell — persistent sidebar navigation

- **Outcome:** owner navigates the app through a persistent left sidebar (from the Claude Design app kit): brand wordmark (Boxes icon + "StockHelper"), nav items **Dashboard / Produkty / Plan zatowarowania** with an active state, a live **Understocked count badge** on the Plan item, and an account card pinned to the bottom (avatar initials, store name, email). A **new `Plan zatowarowania` route** hosts the full itemized weekly restocking plan, moved off the dashboard. Replaces the current ad-hoc header nav (Manage products / Account / Sign out).
- **Change ID:** app-shell-nav
- **PRD refs:** FR-009 (the dashboard is one sidebar destination), US-01 / FR-006 / FR-007 (the itemized restocking plan the new `Plan zatowarowania` route now hosts), NFR-002 (browser support). Note: the app-shell / navigation chrome is field-discovered presentation work **not specified in PRD v1** (same class as S-08–S-10); it reorganizes where existing capabilities live without adding product logic.
- **Prerequisites:** S-09
- **Parallel with:** S-10 (independent UI-refresh work; neither blocks the other)
- **Blockers:** —
- **Unknowns:**
  - Account-card data: the app currently exposes only `user.email` — there is no "store name" concept or avatar. Derive initials/label from the email, or introduce a store-name field? Owner: developer. Block: no (`/10x-plan` resolves; a store-name field would touch F-01).
  - New `Plan zatowarowania` route: its path, whether it joins `PROTECTED_ROUTES`, and how the itemized-plan island moves off the dashboard onto it. Owner: developer. Block: no.
- **Risk:** E2E stability is the dominant risk. This changes navigation and **moves the itemized restocking plan to a new route**, so the Playwright specs asserting nav, headings, and routes (and the dashboard-hosted plan) must be **updated in lockstep** — the one slice in this chain where E2E specs are expected to change, not merely stay green. Accessible names for elements that remain (the `Sign in` / `Dashboard` / `Products` / `Account` headings, the `/auth/signin` route) stay stable. Design source: Claude Design project `a1fc2530` (`ui_kits/app/AppShell.jsx`); pull component recipes via the `claude_design` MCP during implementation.
- **Status:** proposed

### S-12: Dashboard redesign — grouped state cards

- **Outcome:** owner sees the dashboard restructured to match the Claude Design app kit: each classification state group becomes **one Card** with a header row (state **Badge** + item **count** in the mono/tabular face + the state's **threshold definition**) followed by product **rows**; each row surfaces **stock, velocity, days-of-stock, and reorder quantity** in a tabular line (reorder colored red when due). The Badge moves from per-card to **once per group header**. The restock CTA becomes a **teaser** (headline + AI-summary paragraph + an "AI" badge chip on an accent-subtle background), since the full itemized plan now lives on the `Plan zatowarowania` route from S-11.
- **Change ID:** dashboard-redesign
- **PRD refs:** FR-009 (dashboard grouped by classification state — this slice restructures its presentation), FR-006 (threshold definition per state, now shown in each group header), FR-007 (recommended action / reorder quantity, now surfaced per product row), NFR-002 (browser support). Note: a presentation restructure of the existing FR-009 dashboard; no new product logic.
- **Prerequisites:** S-11
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Row-metrics plumbing: the dashboard query must surface per-product velocity / days-of-stock / reorder quantity (already computed by the engine) onto each row without an N+1. Owner: developer. Block: no.
- **Risk:** The grouped-list restructure rewrites the dashboard DOM, but must keep the product links (`role=link`, product name), the `Dashboard` heading, and the fixed per-state grouping order (FR-009) intact. The richer rows surface numbers the classification engine already computes server-side, so there is **no new engine logic** — the risk is query / prop plumbing to get those numbers onto each row within the sub-1-second budget (NFR-001). Depends on S-11 only for the plan-route split; the grouped-list cards + rich rows can otherwise land independently. Design source: Claude Design project `a1fc2530` (`ui_kits/app/DashboardView.jsx`); pull component recipes via the `claude_design` MCP during implementation.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID                           | Suggested issue title                                                                | Ready for `/10x-plan` | Notes                                                                                                  |
| ---------- | ----------------------------------- | ------------------------------------------------------------------------------------ | --------------------- | ------------------------------------------------------------------------------------------------------ |
| F-01       | supabase-schema-and-types           | Schema: products + sales_entries tables with RLS                                     | yes                   | Run `/10x-plan supabase-schema-and-types`                                                              |
| S-01       | product-catalog-crud                | Feature: product catalog — add / edit / delete                                       | no                    | Requires F-01 to be done first                                                                         |
| S-02       | sales-entry-and-classification      | Feature: sales entry logging + velocity classification (north star)                  | no                    | Requires F-01 + S-01 to be done first                                                                  |
| S-03       | classification-dashboard            | Feature: dashboard grouped by classification state                                   | no                    | Requires S-02 to be done first                                                                         |
| S-04       | ai-weekly-restocking-plan           | Feature: AI weekly restocking plan (LLM summary)                                     | no                    | Requires S-03 to be done first                                                                         |
| S-05       | restocking-plan-decision-support    | Enhancement: restocking plan — prioritize + explain                                  | n/a                   | Implemented; see plan.md                                                                               |
| S-06       | ux-improvements                     | UX: bulk review actions, session reset, loading states                               | no                    | Requires F-01; parallel with S-04                                                                      |
| S-07       | account-deletion-and-data-retention | Feature: account deletion (hard delete via auth.users cascade)                       | yes                   | Hard-delete model resolved; fully parallel with S-06; needs SUPABASE_SERVICE_ROLE_KEY                  |
| S-08       | design-system-refresh               | UI: design system refresh — color / typography / spacing tokens on shared components | yes                   | Run `/10x-plan design-system-refresh`; visual layer only, no prereqs                                   |
| S-09       | screens-restyle                     | UI: apply refreshed design to existing screens (dashboard, products, forms)          | no                    | Requires S-08; keep accessible names/roles stable for E2E; parallel with S-10                          |
| S-10       | landing-page                        | UI: real public landing page at `/` (hero, how-it-works, CTA)                        | no                    | Requires S-08; `/` stays public + logged-in redirect to `/dashboard`; parallel with S-09               |
| S-11       | app-shell-nav                       | UI: persistent sidebar nav + new Plan route (restocking plan moved off dashboard)    | no                    | Requires S-09; cross-cutting nav; UPDATE E2E specs for changed nav / moved content; parallel with S-10 |
| S-12       | dashboard-redesign                  | UI: dashboard redesign — grouped state cards + rich product rows + plan teaser       | no                    | Requires S-11; keep product links / Dashboard heading / FR-009 group order stable                      |

## Open Roadmap Questions

None — all product questions were resolved during shaping (PRD v1 `## Open Questions`: none). The date-range overlap validation implementation decision (API layer vs. database constraint vs. both) is an Unknown in S-02 with Block: no — it does not require resolution before S-02 is planned; `/10x-plan` resolves it during detailed planning.

## Parked

- **Shop platform integrations (Shopify / WooCommerce / Etsy API sync)** — Why parked: PRD §Non-Goals; sales data is entered manually at MVP.
- **Multi-store management (switch-store UI, cross-store aggregates)** — Why parked: PRD §Non-Goals; one account maps to one store at MVP.
- **Demand forecasting (future velocity projections, seasonal curves)** — Why parked: PRD §Non-Goals; StockHelper classifies current inventory state only, no prediction.
- **Purchasing action execution (purchase orders, supplier emails, procurement integrations)** — Why parked: PRD §Non-Goals; the app generates a recommendation only.
- **Mobile layout** — Why parked: PRD §Non-Goals; desktop browsers only at MVP.

## Done

- **S-05: get a prioritized, explained weekly restocking decision (not just a restatement)** — Archived 2026-06-22 → `context/archive/2026-06-17-restocking-plan-decision-support/`. Lesson: —.
- **S-06: bulk-action a candidate review, reset a review session, see clear loading states** — Archived 2026-06-22 → `context/archive/2026-06-22-ux-improvements/`. Lesson: —.
- **S-07: delete their account (hard delete; F-01 cascade wipes products + sales entries)** — Archived 2026-06-22 → `context/archive/2026-06-22-account-deletion-and-data-retention/`. Lesson: —.
- **F-01: (foundation) `products` and `sales_entries` tables exist in Supabase with row-level security (RLS) policies enforcing per-user data isolation; TypeScript domain entity types declared in `src/types.ts`; Supabase client query patterns for domain reads established as a reference for downstream slices.** — Archived 2026-07-25 → `context/archive/2026-05-30-supabase-schema-and-types/`. Lesson: —.
- **S-01: owner can add, edit, and delete products in their catalog (name, stock quantity, lead time in days, buffer days), with each change reflected immediately; no other account can see their products.** — Archived 2026-07-25 → `context/archive/2026-05-30-product-catalog-crud/`. Lesson: —.
