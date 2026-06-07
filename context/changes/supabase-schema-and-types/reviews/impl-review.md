<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Supabase Schema and Domain Types

- **Plan**: context/changes/supabase-schema-and-types/plan.md
- **Scope**: All 3 phases (full plan)
- **Date**: 2026-06-07
- **Verdict**: APPROVED (with 1 warning worth a conscious decision)
- **Findings**: 0 critical, 1 warning, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS (automated pass; `db reset` verified at impl commit 0d5f69e + transitively by S-01/S-02/S-03; manual checks left unchecked in Progress) |

## Findings

### F1 — sales_entries UPDATE policy missing WITH CHECK

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (plan flaw — the plan specified UPDATE with USING only)
- **Location**: supabase/migrations/20260530000002_create_sales_entries.sql:36 (`sales_entries_update`)
- **Detail**: The `sales_entries_update` policy has `USING (auth.uid() = user_id)` but no `WITH CHECK`. USING gates which existing rows can be updated; WITH CHECK gates the new values. Without it, an authenticated user can update one of their own sales entries and set `product_id` to a product they do NOT own — the same cross-user association the INSERT policy was deliberately written (EXISTS subquery) to prevent. The `products` UPDATE policy correctly carries both USING and WITH CHECK; the `sales_entries` one is asymmetric. Blast radius is limited (actor can only mutate rows they already own; SELECT still filters by `user_id`), so this is a hardening gap, not an active breach.
- **Fix**: Add a `WITH CHECK` clause to `sales_entries_update` (via a new forward migration — the original already shipped) mirroring the INSERT policy: `WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.products WHERE products.id = product_id AND products.user_id = auth.uid()))`.
  - Strength: Closes the cross-user product-association hole the plan's Critical Implementation Details flagged for INSERT — applies the same guarantee to UPDATE.
  - Tradeoff: Requires a new forward migration; an applied migration can't be edited.
  - Confidence: HIGH — the exact correct clause already exists in the same file's INSERT policy.
  - Blind spot: Haven't confirmed whether any downstream slice issues product_id-changing UPDATEs that this would now reject (unlikely — sales entries appear append/delete in the UI).
- **Decision**: FIXED — added forward migration `supabase/migrations/20260607000001_sales_entries_update_with_check.sql` (2026-06-07)

### F2 — Unchecked `data as Product[]` cast is the reference pattern

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/db.ts:11, src/lib/db.ts:24 (at plan commit 0190d29)
- **Detail**: Both helpers do `.select("*")` then `return data as Product[]`. The plan explicitly specified this ("cast to the domain type"), so it is fully plan-adherent. Flagged only because this is the reference convention S-01/S-02/S-03 copy: the cast asserts shape rather than verifying it, so a drift between the DB schema and `src/types.ts` would be silent. Fine for MVP.
- **Fix**: None required — accepted by plan. Optional future hardening: select explicit columns instead of `*` so the cast is closer to truthful.
- **Decision**: SKIPPED — accepted as the planned convention (2026-06-07)
