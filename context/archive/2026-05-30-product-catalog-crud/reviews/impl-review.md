<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Product Catalog CRUD (S-01)

- **Plan**: context/changes/product-catalog-crud/plan.md
- **Scope**: All phases (1 & 2 of 2)
- **Date**: 2026-06-07
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension           | Verdict                                                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Plan Adherence      | PASS                                                                                                                                 |
| Scope Discipline    | PASS                                                                                                                                 |
| Safety & Quality    | WARNING                                                                                                                              |
| Architecture        | PASS                                                                                                                                 |
| Pattern Consistency | PASS                                                                                                                                 |
| Success Criteria    | PASS (lint + build verified 2026-06-07; `npm run format` passed at implementation; manual checks marked complete and backed by code) |

## Findings

### F1 — DB calls at API/page boundaries lack error handling

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (reliability)
- **Location**: src/pages/api/products/index.ts:19,46 · src/pages/api/products/[id].ts:36,61 · src/pages/products.astro:16
- **Detail**: The db helpers correctly throw on Supabase error (matches the getProductsByUser convention), but the call sites don't catch. A transient PostgrestError propagates as an unhandled rejection: the API routes return a raw 500 with no JSON body, breaking the structured `{ error }` shape the island's `readError()` expects. In products.astro the frontmatter throw yields a full 500 page instead of the "empty catalog" fallback the plan designed for the null-client case. The validation (400) and null-client (503) paths are handled — only the DB-throw path is not. The auth siblings (signin/signup) also skip try/catch, so this is a pre-existing project norm, not a regression — hence WARNING not CRITICAL.
- **Fix**: Wrap the DB calls in the API handlers in try/catch returning `Response.json({ error }, { status: 500 })`; add a try/catch in products.astro frontmatter that falls back to `initialProducts={[]}`.
  - Strength: Restores the documented JSON-error contract the client relies on and the page's own stated empty-catalog fallback.
  - Tradeoff: A few call sites to wrap; slightly more boilerplate per route.
  - Confidence: HIGH — the error-response shape already exists in these files for the 400/401/503 paths; this extends it.
  - Blind spot: Haven't load-tested how often Postgrest throws vs returns error-in-body under the Workers runtime.
- **Decision**: FIXED — wrapped all five DB call sites (index.ts GET/POST, [id].ts PATCH/DELETE, products.astro) in try/catch; API returns structured 500, page falls back to []. Lint + build pass. (2026-06-07)

### F2 — Writes rely solely on RLS for tenant isolation

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: src/lib/db.ts (updateProduct, deleteProduct)
- **Detail**: updateProduct/deleteProduct filter only by `.eq("id", id)` — no explicit user_id scope. Cross-tenant isolation rests entirely on the products_update/products_delete RLS policies (`auth.uid() = user_id`), which are verified present, so a foreign id correctly becomes a 0-row no-match → 404. This is exactly what the plan specified ("rely on RLS … no manual WHERE user_id filter needed on writes"), so it's a deliberate, plan-adherent decision — flagged only as a defense-in-depth note: if RLS is ever dropped or the key changes, products become editable by id.
- **Fix**: None required (matches plan). Optional belt-and-suspenders: add `.eq("user_id", userId)` to the write helpers, as getProductsByUser already scopes explicitly.
- **Decision**: SKIPPED — accepted as deliberate, plan-adherent design; RLS policies verified present (2026-06-07)

### F3 — Minor validation/schema divergences

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/validation/product.ts · src/pages/api/products/[id].ts
- **Detail**: Two harmless edge cases: (1) buffer_days is required by productSchema on POST even though the DB column has DEFAULT 7 — works because the form pre-fills "7", but the API rejects a body that omits it rather than letting the DB default apply. (2) productUpdateSchema = `.partial()` accepts `{}` so an empty PATCH runs a silent no-op write touching only updated_at. Neither is a bug.
- **Fix**: Optional — give buffer_days a schema default of 7, and/or short-circuit PATCH on an empty patch object. Safe to leave as-is for MVP.
- **Decision**: SKIPPED — harmless edge cases, left as-is for MVP (2026-06-07)
