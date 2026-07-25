# Sales Entry Logging + Velocity Classification (S-02) — Plan Brief

> Full plan: `context/changes/sales-entry-and-classification/plan.md`

## What & Why

The roadmap North star: the smallest end-to-end slice that proves StockHelper's core hypothesis —
that turning raw sales data into a classified velocity state plus a specific recommendation is
meaningfully better than a spreadsheet. An owner logs non-overlapping sales entries for a product and
immediately sees its classification (Understocked / Watch / OK / Slow-mover / Insufficient data), the
threshold definition for that state, and a concrete action ("Order X units" / "Consider promotion" /
"Set lead time…"), then can delete an entry and watch it recalculate.

## Starting Point

F-01 and S-01 are done. The `sales_entries` table (with RLS, cascade, `units_sold > 0`, `end >= start`),
the `SalesEntry` type, and a `getSalesEntriesByProduct` read helper already exist — but there is **no
overlap protection, no classification engine, no sales-entry API or UI, and no test framework**. The
S-01 product slice established every pattern this builds on: shared zod schemas, null-guarded JSON API
routes, throw-on-error db helpers, and an SSR-page-plus-React-island UI with in-place state updates.

## Desired End State

Clicking a product opens `/products/[id]`, showing a classification panel (state badge + threshold
definition + recommendation) above a sales-entry list with add/delete. Logging a valid entry or
deleting one updates the classification in place within 1 second; an overlapping range is rejected with
a clear message. Strict per-account isolation throughout.

## Key Decisions Made

| Decision               | Choice                                                                          | Why (1 sentence)                                                                                     | Source |
| ---------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------ |
| Overlap enforcement    | API check + DB exclusion constraint                                             | Friendly per-field error from the API, plus a physical guarantee against corruption even under races | Plan   |
| Classification compute | Pure TS `classify()`, server-computed, returned in API responses                | Single source of truth, trivially testable, no client/server drift, one round-trip for NFR-001       | Plan   |
| UI surface             | Dedicated `/products/[id]` detail page                                          | Room for thresholds + entry history, clean linkable URL S-03 will reuse                              | Plan   |
| Day-count              | Inclusive per entry `(end−start)+1`, summed                                     | Matches owner intuition, avoids divide-by-zero, consistent with the DB end≥start check               | Plan   |
| No lead time           | Lead-independent states only (OK + "set lead time", Slow-mover if velocity<0.1) | Honest partial signal without fabricating an uncomputable band                                       | Plan   |
| Eval order             | Insufficient → Slow-mover → Understocked → Watch → OK                           | The barely-selling (velocity<0.1) signal wins over a coincidental OK day-band                        | Plan   |
| Reorder rounding       | `Math.ceil` to whole units                                                      | Can't order fractions; rounding up errs toward not stocking out                                      | Plan   |
| Testing                | Add Vitest, unit-test `classify()` only                                         | The one piece where a silent math bug invalidates the whole hypothesis                               | Plan   |
| Entry editing          | Out of scope (log + delete only)                                                | Matches PRD exactly; correction is delete-then-re-add (US-03)                                        | Plan   |
| Catalog badge          | Detail page only; catalog stays plain                                           | The grouped multi-product view + its N+1 risk is explicitly S-03's job                               | Plan   |
| Date rules             | Reject future `end_date` + valid ISO dates                                      | Blocks the obvious data error that would skew velocity and the 7-day threshold                       | Plan   |

## Scope

**In scope:** classification engine + tests; overlap exclusion-constraint migration; sales-entry zod
schema; create/delete db helpers; nested sales-entry API returning recomputed classification;
`/products/[id]` detail page + island (panel, add form, delete); route protection; catalog→detail link.

**Out of scope:** entry editing; classification on the catalog list; the grouped dashboard (S-03);
forecasting / purchase execution; undo / audit trail; max-range caps; product-schema or product-CRUD
changes.

## Architecture / Approach

Engine-first, then server, then UI. A pure `classify(product, entries)` (server-side only — the
product's IP) is the single source of truth, computed on the page for first paint and returned by the
POST/DELETE entry routes so the island refreshes in one round-trip. Overlap is enforced twice: an
in-app inclusive-range check (→ 409) backed by a Postgres `daterange` GiST exclusion constraint.

## Phases at a Glance

| Phase                   | What it delivers                                                                               | Key risk                                                           |
| ----------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 1. Engine + Vitest      | Pure `classify()` + day-count math + full unit-test suite                                      | Threshold/precedence/rounding correctness — the core IP            |
| 2. Overlap + API        | Exclusion-constraint migration, zod schema, db helpers, nested routes returning classification | Overlap semantics matching between app and DB; constraint backstop |
| 3. Detail page + island | `/products/[id]` SSR page, classification panel, entry add/delete, in-place recompute, nav     | NFR-001 1s recompute; route-guard + isolation on the new route     |

**Prerequisites:** F-01 + S-01 done (they are). Local Supabase via `npx supabase start` for migration

- manual testing.
  **Estimated effort:** ~3 sessions, one per phase.

## Open Risks & Assumptions

- Overlap semantics must match exactly between the in-app check and the DB constraint (both inclusive,
  `[]`); a mismatch produces confusing 500s instead of clean 409s.
- The new migration fails if a dev DB already holds overlapping rows — none should exist pre-S-02; reset
  if needed.
- NFR-001 assumes small data volumes (per PRD); the single-product, single-round-trip design holds well
  inside that assumption.

## Success Criteria (Summary)

- An owner crossing 7 days of history sees a correct classification + threshold definition + specific
  recommendation within ~1 second, and a Slow-mover/no-lead-time product shows the right action.
- Overlapping entries are rejected (API 409 and DB constraint); deleting back under 7 days reverts to
  "Insufficient data".
- No account can read another account's product or entries, including on the new detail route.
