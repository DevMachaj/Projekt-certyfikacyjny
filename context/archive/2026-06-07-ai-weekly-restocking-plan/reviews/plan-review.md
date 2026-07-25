<!-- PLAN-REVIEW-REPORT -->

# Plan Review: AI Weekly Restocking Plan (S-04)

- **Plan**: `context/changes/ai-weekly-restocking-plan/plan.md`
- **Mode**: Deep
- **Date**: 2026-06-07
- **Verdict**: REVISE → SOUND (after triage)
- **Findings**: 1 critical, 1 warning, 1 observation — all fixed

## Verdicts

| Dimension             | Verdict (initial) | After fixes |
| --------------------- | ----------------- | ----------- |
| End-State Alignment   | FAIL (F1)         | PASS        |
| Lean Execution        | PASS              | PASS        |
| Architectural Fitness | PASS              | PASS        |
| Blind Spots           | WARNING (F2, F3)  | PASS        |
| Plan Completeness     | PASS              | PASS        |

## Grounding

11/11 paths ✓ (`src/lib/services/` intentionally absent), symbols ✓ (`classify`, `recommendationText`, `STATE_ORDER`, supabase null-guard, `getProductsByUser`/`getSalesEntriesByUser`, `Product`/`SalesEntry` types), brief↔plan ✓, Progress↔Phase mechanical contract ✓ (5 phases matched, all success-criteria bullets have Progress checkboxes), Anthropic Messages API shape verified via the `claude-api` skill ✓ (`output_config.format` + `json_schema`, `claude-haiku-4-5` is a supported structured-output model, no beta header required, successful structured-output response returns `stop_reason: "end_turn"` — so the plan's guard is correct).

## Findings

### F1 — "ai" path displays the model's items, contradicting the engine-authoritative invariant

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: Critical Implementation Details (l.56) vs Phase 3 (l.205) / Phase 5 (l.278)
- **Detail**: The plan contradicted itself on which `items` reach the user on the `"ai"` path. Line 56 said "the deterministic `items` are authoritative for display," but Phase 3 returned `{ ...parsed, source: "ai" }` (the model's items) and described them as "accepted as wording only," and Phase 5 rendered the `items` from that returned plan. Followed literally (Phase 3 → Phase 5), the per-product action list shown to the user is the LLM's output. Product names are user-controlled and flow into the LLM payload, so a hallucinated or prompt-injected response could surface a fabricated quantity for a `Watch` item — breaking Success Criterion 5.4 ("Watch shows 'Monitor', no quantity") and the change's core promise that a bad LLM response "cannot corrupt … the recommendation."
- **Fix A ⭐ Recommended**: LLM returns only the prose summary; items are always the deterministic ones.
  - Strength: Makes the engine authoritative by construction — 5.4 and the safety invariant hold for free, and the product-name injection vector can't reach the item list. Simpler schema, fewer tokens.
  - Tradeoff: The LLM can't reword individual action lines — only the overall summary.
  - Confidence: HIGH — matches the change.md invariant and Phase 2's deterministic-plan-as-source-of-truth design.
  - Blind spot: None significant.
- **Fix B**: Keep model items but reconcile against the deterministic plan before returning (overwrite each `action` with the deterministic one; fallback on mismatch).
  - Strength: Preserves per-item AI phrasing while guaranteeing numbers/states are engine-derived.
  - Tradeoff: More code and a matching/validation step; "mismatch → fallback" is fiddly to define.
  - Confidence: MED — workable, but reconciliation is exactly what Phase 2's design was meant to avoid.
  - Blind spot: Product-name collisions make by-name matching ambiguous; uniqueness not verified.
- **Decision**: FIXED via Fix A. Edits applied to plan.md:
  - Desired End State (l.22): clarified `items` is always the engine-built list and `weekly_summary` is the only AI-authored field on the `"ai"` path.
  - Critical Implementation Details (l.56): "the LLM never produces the item list"; the schema returns only `weekly_summary`; `items` always taken from the deterministic plan; a bad/injected response can only affect summary wording.
  - Phase 3 §2: `parseSummaryResponse(body): { weekly_summary: string } | null` (validates `weekly_summary` only).
  - Phase 3 §3: `summarizeRestockPlan` returns `{ weekly_summary: parsed.weekly_summary, items: deterministicPlan.items, source: "ai" }`; schema requests only `weekly_summary`.
  - Phase 3 §3 Contract: `json_schema` requests only `{ weekly_summary: string }`; deterministic `items` authoritative on both `"ai"` and `"fallback"` paths; noted this narrows research's "Exact fetch shape".
  - Phase 3 §4 test + Testing Strategy: aligned to the `weekly_summary`-only shape.

### F2 — Fixed `max_tokens: 1024` means large catalogs silently always fall back

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 3 (l.203) / research "Exact fetch shape"
- **Detail**: Output is capped at `max_tokens: 1024`, but response size scales with candidate count. The plan assumed "a handful of products" without capping candidates. A user with many flagged products produces a response exceeding 1024 tokens → `stop_reason: "max_tokens"` → safe but silent routing to the deterministic fallback, so the AI path quietly never engages for the power users with the most to reorder. (Fix A shrinks the response to prose-only, substantially reducing but not eliminating this.)
- **Fix**: Cap candidate count or scale `max_tokens` with candidate count; if keeping a fixed cap, note in Phase 3 that large catalogs are an expected fallback case so it isn't mistaken for a bug.
  - Strength: Keeps the AI path working as the catalog grows; removes a silent coverage hole.
  - Tradeoff: A top-N cap drops items from the AI summary; scaling tokens raises worst-case cost/latency slightly.
  - Confidence: HIGH — the token-budget/candidate-count coupling is mechanical.
  - Blind spot: Typical catalog size at this stage isn't measured; the cap may rarely bind.
- **Decision**: FIXED. Added a Performance Considerations note: since the response is now prose-only the cap is unlikely to bind; a large-catalog `source: "fallback"` is expected behavior, not a bug; revisit (cap candidate count or scale `max_tokens`) only if real catalogs grow large enough for it to bind in practice.

### F3 — First structured-output call may hit the ~10s timeout on cold schema compilation

- **Severity**: 🔎 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Critical Implementation Details (l.57)
- **Detail**: Per the Anthropic structured-outputs docs, a new `json_schema` incurs a one-time compilation cost (cached ~24h). The first call after a deploy could occasionally approach the ~10s `AbortController` timeout and degrade to fallback. Self-healing (subsequent calls use the cached schema) and the fallback is correct, so it's informational rather than a defect.
- **Fix**: Optionally note it as an expected one-off in Phase 3 manual verification so a cold-start fallback isn't mistaken for a broken integration.
- **Decision**: FIXED. Added a Phase 3 manual-verification note: the first call against a freshly compiled schema may degrade to `source: "fallback"`; retry once; don't mistake a cold-start fallback for a broken integration.

## Triage Summary

```
Fixed:     F1 (Fix A), F2 (note), F3 (note)   (3)
Skipped:   —
Accepted:  —
Dismissed: —

► Verdict after fixes: REVISE → SOUND
```

The plan was already well-grounded — the Anthropic integration checked out against the live API reference and every codebase claim verified. With F1 resolved, the central "engine stays authoritative" guarantee is enforced in the data flow rather than only stated. The plan is ready for `/10x-implement ai-weekly-restocking-plan phase 1`.
