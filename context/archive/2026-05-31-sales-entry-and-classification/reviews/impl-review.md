<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Sales Entry Logging + Velocity Classification (S-02, North star)

- **Plan**: context/changes/sales-entry-and-classification/plan.md
- **Scope**: All phases (1–3 of 3)
- **Date**: 2026-06-07
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension           | Verdict                                                                                                                                                                                       |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plan Adherence      | PASS                                                                                                                                                                                          |
| Scope Discipline    | WARNING                                                                                                                                                                                       |
| Safety & Quality    | WARNING                                                                                                                                                                                       |
| Architecture        | PASS                                                                                                                                                                                          |
| Pattern Consistency | PASS                                                                                                                                                                                          |
| Success Criteria    | PASS (npm test 28 passing; lint + build verified 2026-06-07; format passed at impl; migration verified at impl 9a1e587 + transitively by S-03; manual checks marked complete and code-backed) |

## Findings

### F1 — Nested sales-entry routes lack DB error handling

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (reliability) + pattern consistency
- **Location**: src/pages/api/products/[id]/sales-entries/index.ts:39-46 (GET), :77-83 + re-thrown non-409 (POST) · likely the recompute reads in [entryId].ts too
- **Detail**: The GET reads (getProductById / getSalesEntriesByProduct) and the POST's pre-mutation reads are not wrapped in try/catch. A PostgrestError throws → unstructured 500 with no JSON `{ error }`, breaking the shape the island's readError() expects. The POST's createSalesEntry IS wrapped, but only to translate the 23P01 exclusion violation to a 409 — a re-thrown non-409 error escapes unstructured. Same gap fixed in the sibling product routes this session (commit 1de4ca6); the nested routes diverge from that now-established convention.
- **Fix**: Wrap the DB read/mutation boundaries in these nested routes in try/catch returning `Response.json({ error }, { status: 500 })`, matching the product routes.
  - Strength: Restores the JSON-error contract and aligns with the convention the product routes now follow.
  - Tradeoff: A few call sites; the POST already has a catch for the 409, so it needs care to keep the 409 path while adding the 500.
  - Confidence: HIGH — identical fix just applied to products/index.ts.
  - Blind spot: Haven't re-confirmed [entryId].ts line numbers for the recompute reads; check at fix time.
- **Decision**: FIXED — wrapped DB boundaries in both nested routes (index.ts GET/POST, [entryId].ts DELETE) in try/catch returning structured 500; POST's inner 409 path preserved. Lint + build pass. (2026-06-07)

### F2 — signup.ts changed despite "no auth-flow changes" guardrail

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/pages/api/auth/signup.ts:22-26
- **Detail**: The slice added an early `if (data.session) return redirect("/")` to signup, so when email confirmation is disabled the user lands logged-in on / instead of a confirm-email dead-end. The plan's "What We're NOT Doing" explicitly says "No changes to auth flow." Both review agents confirm it's a contained, correct UX bugfix with no security regression (no fabricated session, static redirect targets, error path unchanged) — but it is undocumented scope creep into a guardrailed area, landed in this slice's p3 commit (088aa63).
- **Fix A ⭐ Recommended**: Document it as a plan addendum / accept the fix.
  - Strength: Preserves a correct bugfix; records the scope decision so the plan stops contradicting the code.
  - Tradeoff: The "no auth changes" guardrail was crossed without notice.
  - Confidence: HIGH — change is verified benign by two agents.
  - Blind spot: Whether the confirm-email flow is still desired when confirmations are ENABLED (that path is unchanged, so fine).
- **Fix B**: Revert from this slice, re-land in its own change.
  - Strength: Restores strict scope discipline.
  - Tradeoff: Loses a correct fix that's already shipped and depended on.
  - Confidence: MEDIUM — need to confirm nothing now relies on the redirect.
  - Blind spot: Haven't checked for a separate change owning this fix.
- **Decision**: FIXED via Fix A — documented as a plan addendum in plan.md ("Addenda (post-implementation)"); fix accepted, no revert (2026-06-07)

### F3 — allow_zero_units migration not reflected in the plan

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline / Plan Adherence
- **Location**: supabase/migrations/20260606000001_sales_entries_allow_zero_units.sql
- **Detail**: The plan specified units_sold > 0 (schema + DB), but a later migration relaxed the DB CHECK to >= 0 and salesEntrySchema was updated to match (.nonnegative()). This is a coordinated, internally-consistent change — DB, schema, engine (velocity 0 → Slow-mover), and a dedicated test all agree, and the migration comment documents the rationale. The only gap is that plan.md still says > 0, so the plan is stale vs the implementation.
- **Fix**: Add a one-line plan addendum noting the >0 → >=0 decision. No code change needed — implementation is correct and tested.
- **Decision**: ACCEPTED — documented in the plan addendum ("Addenda (post-implementation)"); implementation correct and tested, no code change (2026-06-07)

### F4 — Entry DELETE not scoped to the path's product_id

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: src/pages/api/products/[id]/sales-entries/[entryId].ts (deleteSalesEntry)
- **Detail**: deleteSalesEntry filters by entryId alone. RLS correctly blocks cross-user deletes (foreign id → 0 rows → 404), so there's no tenant leak. But there's no app-layer check tying the entry to the product `id` in the URL — an owner could delete their own entry X of product A via product B's URL, after which the recompute runs against product B's (wrong) entry set. Same-owner only, so low impact.
- **Fix**: Optional — scope the delete (or a pre-check) by product_id in addition to entryId. Safe to leave for MVP given single-owner scope.
- **Decision**: FIXED — deleteSalesEntry now takes productId and filters `.eq("product_id", productId)`; call site passes the path's product id. Mismatched product → 0 rows → 404. Lint + build + tests pass. (2026-06-07)
