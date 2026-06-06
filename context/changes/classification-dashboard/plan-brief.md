# Classification Dashboard (S-03) — Plan Brief

> Full plan: `context/changes/classification-dashboard/plan.md`

## What & Why

Owners can already classify products one at a time (S-02). S-03 gives them the
catalog-wide view the PRD's secondary success criterion calls for: every product
grouped by classification state (Understocked → Watch → OK → Slow-mover →
Insufficient data), alphabetical within each group, so they see their whole
inventory's health at a glance instead of clicking through products one by one.

## Starting Point

S-02 shipped a complete, working classification flow: the pure `classify()` engine
(`src/lib/classification.ts`), throw-on-error Supabase db helpers, and a
`/products/[id]` detail page. The dashboard (`dashboard.astro`) is still just a
placeholder welcome card. Two gaps stand between today and S-03: there is no
batch query for all of a user's sales entries (only a single-product one), and the
display constants the dashboard needs (state order, badge colors, recommendation
wording) are trapped as locals inside the React detail-panel component.

## Desired End State

`/dashboard` renders the owner's whole catalog grouped by classification state in
fixed order, alphabetical within each group, empty states hidden. Each card shows
name + state badge + recommended action and links to the detail page. New owners
see an "add your first product" empty state. The page makes exactly two Supabase
queries regardless of catalog size. The engine, schema, and detail page are
unchanged.

## Key Decisions Made

| Decision              | Choice                                                              | Why (1 sentence)                                                                          | Source |
| --------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | ------ |
| Card content          | Name + state badge + recommended action                            | Makes the dashboard a decision surface, not just a sorted index — StockHelper's value prop | Plan   |
| Empty groups          | Hide states with no products                                       | Keeps focus on states that need attention; avoids empty headers for small catalogs         | Plan   |
| No-products state     | Friendly empty panel with "add product" CTA                        | Guides the new owner to the obvious next step; standard onboarding                          | Plan   |
| Navigation            | Cards link to `/products/[id]`; keep Manage-products + Sign out    | Dashboard becomes the landing surface with clear paths to act                               | Plan   |
| Catalog list scope    | Dashboard-only; `/products` stays the plain CRUD list              | Matches FR-009 and the S-02 boundary; dashboard is the dedicated classification surface     | Plan   |
| Query shape           | Two batch queries (products + all entries), group in memory        | Kills the roadmap's named N+1 risk; constant query count as the catalog grows (NFR-001)     | Plan   |
| Rendering             | Pure Astro SSR, no React island                                    | Dashboard is view + click-through only; the engine must stay server-side anyway             | Plan   |
| Shared constants      | Lift `STATE_ORDER` + recommendation text → engine; styles → UI module | One source of truth so detail page and dashboard can't drift on order/colors/wording      | Plan   |
| Grouping helper       | Pure `groupProductsByState()`, unit-tested in Vitest               | The one bit of new logic with an ordering contract worth locking with tests                 | Plan   |

## Scope

**In scope:** `getSalesEntriesByUser` batch helper; lift `STATE_ORDER` +
`recommendationText()` into the engine and `STATE_STYLES` into a shared UI module
(refactor `ClassificationPanel` to consume them, no behavior change); pure
`groupProductsByState()` + tests; rewrite `dashboard.astro` with grouped cards,
empty state, and existing nav; a small `ProductCard.astro`.

**Out of scope:** classification on the `/products` list; any client interactivity
on the dashboard; engine/schema/type/CRUD changes; pagination; new states or
recommendations.

## Architecture / Approach

Data layer first, then view. Frontmatter of `dashboard.astro` runs two queries
(`getProductsByUser` + `getSalesEntriesByUser`), builds a
`Map<product_id, SalesEntry[]>`, calls the unchanged `classify()` per product, then
`groupProductsByState()` to produce ordered non-empty groups rendered as
`ProductCard.astro` links. The engine stays server-side; grouping is a pure transform
beside it.

## Phases at a Glance

| Phase                          | What it delivers                                                            | Key risk                                                       |
| ------------------------------ | --------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 1. Data layer + constants      | Batch query, lifted shared constants/wording, pure tested grouping helper   | Constant extraction must leave the detail page visually identical |
| 2. Dashboard page              | Rewritten `dashboard.astro` + `ProductCard.astro`: groups, empty state, nav | Group order/sort correctness; two-query (non-N+1) data fetch    |

**Prerequisites:** F-01 + S-01 + S-02 done (they are). Local Supabase
(`npx supabase start`) with seeded multi-state products for manual verification.
**Estimated effort:** ~1–2 sessions, one per phase.

## Open Risks & Assumptions

- The Phase 1 constant extraction must produce zero visible change on the detail
  page — verified manually before Phase 2.
- Within-group alphabetical order relies on `getProductsByUser` returning
  name-sorted rows (it does, `db.ts:11`) and `groupProductsByState` preserving input
  order.
- Two-query performance assumes MVP data volumes (per PRD) — comfortably within NFR-001.

## Success Criteria (Summary)

- Products appear grouped in the fixed order, alphabetical within each group, with
  empty groups hidden; each card's recommendation matches its detail page.
- A new owner sees a guiding empty state; the dashboard issues two queries, not N+1.
- No account can see another account's products on the dashboard (NFR-003).
