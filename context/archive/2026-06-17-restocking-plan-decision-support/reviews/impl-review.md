<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Restocking Plan — Prioritized, Explained Weekly Decision

- **Plan**: context/changes/restocking-plan-decision-support/plan.md
- **Scope**: Full plan (Phases 1–3 of 3)
- **Date**: 2026-06-17
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Automated success criteria: `npm test` 49/49 pass · `npm run lint` no errors · `npm run build` complete.

## Findings

### F1 — RestockPlan field never renamed weekly_summary → headline

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: src/lib/restocking.ts:32 (+ consumers)
- **Detail**: Phase 1 contract #4 specified renaming RestockPlan's prose field weekly_summary → headline. Not done: RestockPlan still declares `weekly_summary` (restocking.ts:32) and every consumer uses it (buildDeterministicPlan :103,112; RestockingPlan.tsx:93; route via spread). The name `headline` lives only on the AI wire DTO (AiPlanResponse) and JSON schema; mergeAiReasons bridges them with `weekly_summary: parsed.headline` (restocking-summary.ts:114). Internally consistent — nothing breaks — but the named contract is unmet and the internal name no longer matches the AI-facing/plan name.
- **Fix A ⭐ Recommended**: Rename RestockPlan.weekly_summary → headline across restocking.ts, mergeAiReasons, and RestockingPlan.tsx (route spreads, unaffected).
  - Strength: Aligns the internal contract with the plan and AI DTO/schema; removes the weekly_summary↔headline split in mergeAiReasons.
  - Tradeoff: Mechanical rename across ~3 files + tests; cosmetic, no behavior change.
  - Confidence: HIGH — type-checked rename; 49-test suite catches misses.
  - Blind spot: None significant — route uses spread, no literal field.
- **Fix B**: Accept weekly_summary; annotate the plan as the drift source.
  - Strength: Zero code churn; code already works and is consistent.
  - Tradeoff: Plan and code names stay divergent; bridge line remains a readability snag.
  - Confidence: HIGH — nothing external depends on the name.
  - Blind spot: None.
- **Decision**: FIXED via Fix A — renamed weekly_summary → headline across restocking.ts, restocking-summary.ts, RestockingPlan.tsx + both test files; 49/49 tests pass, lint clean.

### F2 — User catalog names/facts interpolated into LLM prompt

- **Severity**: 🔎 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/restocking-summary.ts:157
- **Detail**: Product names + engine facts are JSON-stringified into the user prompt. Not a vulnerability by design: the deterministic plan is built first and is the sole source of items/order/action/quantity/facts; mergeAiReasons overlays only prose by exact name (dropping hallucinated/injected products); React renders prose as inert text. Worst case is altered prose in the user's own summary.
- **Fix**: None required — accepted as by-design.
- **Decision**: SKIPPED — acknowledged as by-design (engine-authoritative; AI prose only; inert text render).

### F3 — Non-dismissible error banner vs dismissible sibling islands

- **Severity**: 🔎 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/dashboard/RestockingPlan.tsx:74-79
- **Detail**: Sibling islands (ProductCatalog, ProductDetail) use a dismissible error banner with an X button; RestockingPlan's banner clears only on the next generate(). Acceptable for a transient action-triggered error.
- **Fix**: Optional — add a dismiss button to match siblings if banner parity is desired.
- **Decision**: SKIPPED — acceptable for a transient action error; clears on next generate().
