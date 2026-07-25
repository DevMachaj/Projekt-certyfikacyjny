<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Classification Dashboard (S-03)

- **Plan**: context/changes/classification-dashboard/plan.md
- **Scope**: All phases (1–2 of 2)
- **Date**: 2026-06-07
- **Verdict**: APPROVED (with 1 warning worth a decision)
- **Findings**: 0 critical, 1 warning, 0 observations

## Verdicts

| Dimension           | Verdict                                                                                                                                                                     |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plan Adherence      | PASS                                                                                                                                                                        |
| Scope Discipline    | PASS                                                                                                                                                                        |
| Safety & Quality    | WARNING                                                                                                                                                                     |
| Architecture        | PASS                                                                                                                                                                        |
| Pattern Consistency | PASS                                                                                                                                                                        |
| Success Criteria    | PASS (npm test 28 passing incl. groupProductsByState; lint + build verified 2026-06-07; manual checks marked complete and code-backed; two-query/no-N+1 verified by review) |

## Findings

### F1 — dashboard.astro lacks DB error handling

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (reliability) + pattern consistency
- **Location**: src/pages/dashboard.astro:19-37
- **Detail**: getProductsByUser and getSalesEntriesByUser both throw on a Postgrest error, and the two awaits in the dashboard frontmatter are unguarded. The sibling products.astro was given exactly this try/catch this session (commit 1de4ca6) — fall back rather than 500 the page. A transient DB error, or a missing remote migration (deploy-workflow note flags that as a known 500 cause — and there is an unpushed migration right now), hard-500s the whole dashboard instead of degrading to the empty state. `groups` is already initialized to [] (line 17), so the fallback is free. This is the THIRD appearance of this same gap this session (products.astro F1, the sales-entry routes F1, now here) — a recurring project pattern worth recording as a lesson, not just a one-off fix.
- **Fix**: Wrap the two awaits (+ the in-memory grouping) in try/catch with a `groups = []` fallback, matching products.astro.
  - Strength: Brings the last SSR data-fetch page in line with the now-established convention; prevents a hard 500 on exactly the migration-drift scenario that is live right now.
  - Tradeoff: None meaningful — fallback is already wired (groups = []).
  - Confidence: HIGH — identical guard already applied to products.astro.
  - Blind spot: Whether an explicit error banner is preferable to silently showing the empty state (products.astro chose silent).
- **Decision**: FIXED + ACCEPTED-AS-RULE — wrapped the dashboard.astro DB boundary in try/catch with `groups = []` fallback (lint + build pass); recorded the recurring pattern as a rule in context/foundation/lessons.md ("Wrap throw-on-error DB calls at SSR/API boundaries") (2026-06-07)
