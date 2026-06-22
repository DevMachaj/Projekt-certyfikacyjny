# Restocking Plan — Prioritized, Explained Weekly Decision Implementation Plan

## Overview

Widen the AI restocking feature's contract from **restate** to **prioritize + explain**. Today the AI only rewords the engine's output into one sentence and the panel re-lists the dashboard tiles, so it adds no decision support (see `context/changes/ai-weekly-restocking-plan/frame.md`). After this change: the engine deterministically **orders** the restock candidates by urgency and computes the supporting **facts**; the AI adds a one-sentence **headline** plus a one-line **"why"** for each product. Quantities, states, actions, product selection, and order stay engine-authoritative — the AI contributes prose only, mapped back onto engine-built items by product name. The fallback path produces deterministic reasons so it still beats the tiles when the LLM is unavailable.

## Current State Analysis

From the frame brief's verified investigation:

- **`RestockCandidate`** (`src/lib/restocking.ts:10-17`) carries `product, state, units, action, daysOfStock, velocity` — but **not** `leadTime`. `selectRestockCandidates` (`:41-60`) orders Understocked-before-Watch in input order, not by urgency.
- **`buildDeterministicPlan`** (`:67-82`) returns `{ weekly_summary, items: [{product, action}] }` — items carry no reason or facts.
- **The service** (`src/lib/services/restocking-summary.ts`) sends the full candidate facts to the model (`:107`) but the prompt says *"restate… do NOT recompute… Return only the weekly_summary"* (`:25-30`) and the schema permits only `{ weekly_summary: string }` (`:16-23`). `parseSummaryResponse` (`:51-70`) validates that one string. On success it returns `items: plan.items` (engine-built) + AI `weekly_summary`; on any failure → `source: "fallback"`.
- **The route** (`src/pages/api/restocking-plan/index.ts`) returns whatever `summarizeRestockPlan` produces, with an empty-case short-circuit (`:39-41`).
- **The island** (`src/components/dashboard/RestockingPlan.tsx:91-99`) renders `weekly_summary` + `items.map(product → action)` — identical to `ProductCard.astro`.
- All Understocked/Watch candidates have a non-null `leadTime` (both are lead-time-band states) and a finite `daysOfStock` (velocity ≥ 0.1 in those bands), so an urgency metric `daysOfStock − leadTime` is always well-defined for candidates (`src/lib/classification.ts:148-162`).

### Key Discoveries:

- `src/lib/restocking.ts:46,48` — `units`/`action` are engine-derived; `leadTime` must be added from `product.lead_time_days`.
- The cert safety invariant is **self-imposed** (frame "Cross-System Convention"): prioritizing/explaining is synthesis over engine values, not recomputation — so widening the contract is allowed as long as the AI never emits the order, an action, a quantity, or a product.
- Existing tests `src/lib/restocking.test.ts` and `src/lib/services/restocking-summary.test.ts` are the pattern to extend; `astro:env/server` is stubbed for tests via `vitest.config.ts` + `src/test/astro-env-server.stub.ts`.

## Desired End State

On `/dashboard`, "Generate weekly restocking plan" returns `{ headline, items: [{ product, action, reason, daysOfStock, leadTime, units, state }], source }`, where:
- **items** are always engine-built and **ordered by urgency** (most urgent first);
- **headline** and each item's **reason** are AI-authored on the `"ai"` path, deterministic on `"fallback"`/`"empty"`;
- the island shows the headline, then a ranked list where each row carries the action, the "why", and a small deterministic facts line (days of stock vs lead time) — so the AI prose sits next to verifiable engine numbers.

Verification: `npm test`, `npm run lint`, `npm run build` pass; the dashboard button shows a prioritized, explained plan; with the key unset the labeled fallback still shows deterministic reasons; an account with nothing to reorder shows the headline message; a hallucinated product in the AI response never appears, and a missing AI reason falls back to the deterministic one.

## What We're NOT Doing

- No change to `classify()`, the engine rules, the classification states, or the dashboard's grouped tile view.
- No new DB tables/columns/migrations; no persistence or caching of plans; no streaming.
- No change of LLM provider or model (`claude-haiku-4-5` stays).
- The AI does **not** decide the order, emit an action/quantity, or select products — it only writes the headline and per-product reason text.
- No new rate-limiting beyond the existing disabled-while-pending button.

## Implementation Approach

Build engine-outward: first make the deterministic core carry everything the UI needs (urgency order, facts, deterministic reasons, headline) so the fallback is already valuable (Phase 1). Then widen the AI contract on top of that core — richer schema + prompt + a pure merge that maps AI reasons onto the engine items by name, dropping anything unvalidated (Phase 2). Finally surface it in the island (Phase 3). The deterministic plan from Phase 1 is the single source of truth for order, items, numbers, and the failure fallback, so the engine stays authoritative end to end.

## Critical Implementation Details

- **The AI must never become the source of a number, action, order, or product.** The response schema returns only `headline` + `items:[{product, reason}]`. The merge keys AI reasons onto engine-built items **by exact product name**: unknown products are dropped, engine items missing an AI reason keep their deterministic reason. Order, action, units, and the displayed facts come from the engine regardless of the model's output — so a hallucinated or injected response can only alter prose.
- **Urgency metric**: `daysOfStock − leadTime`, ascending (most negative = most urgent). Understocked (`daysOfStock < leadTime`) sorts ahead of Watch (`leadTime ≤ daysOfStock < 2·leadTime`) for free; ties preserve input (alphabetical) order. Guard the null case defensively (sort nulls last) even though candidates always have both fields.

---

## Phase 1: Engine — urgency ordering, facts, deterministic reasons

### Overview

Make the pure deterministic core carry the order, per-item facts, deterministic reasons, and a headline — so both the AI path and the fallback build on one authoritative plan.

### Changes Required:

#### 1. Extend the candidate + plan contract

**File**: `src/lib/restocking.ts`

**Intent**: Add `leadTime` to `RestockCandidate`; sort candidates by urgency; enrich the plan so items carry the reason and the facts the UI shows, and rename the plan's prose field to `headline`.

**Contract**:
- `RestockCandidate` gains `leadTime: number | null` (from `product.lead_time_days`).
- `selectRestockCandidates(items)` returns the Understocked+Watch candidates **sorted by urgency** (`daysOfStock − leadTime` ascending; nulls last; stable within ties).
- `RestockPlanItem` becomes `{ product: string; action: string; reason: string; daysOfStock: number | null; leadTime: number | null; units: number | null; state: "Understocked" | "Watch" }`.
- `RestockPlan` becomes `{ headline: string; items: RestockPlanItem[] }` (rename `weekly_summary` → `headline`).
- New pure `deterministicReason(c: RestockCandidate): string` — a factual one-liner from engine numbers (Understocked vs Watch wording; references `daysOfStock` and `leadTime`, never invents).
- `buildDeterministicPlan(candidates)`: empty → `{ headline: "Nothing to reorder this week.", items: [] }`; non-empty → a deterministic count headline + items mapped from candidates with `reason: deterministicReason(c)` and the engine facts.

#### 2. Unit tests

**File**: `src/lib/restocking.test.ts`

**Intent**: Cover the new ordering and enrichment.

**Contract**: Add cases — candidates sorted most-urgent-first across states; `leadTime` populated; `deterministicReason` is factual and Watch's reason carries no order quantity; `buildDeterministicPlan` produces a headline + enriched items; empty-case headline. Keep existing invariants (Watch never emits a quantity; excluded states excluded).

### Success Criteria:

#### Automated Verification:
- Unit tests pass: `npm test`
- Lint/type check passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification:
- Review the new test cases confirm urgency ordering and that Watch reasons never contain an order quantity.

**Implementation Note**: Pure logic — automated verification is sufficient. Pause for human confirmation of the test coverage before Phase 2.

---

## Phase 2: Service + route — widen the AI contract

### Overview

Grow the AI schema and prompt from "restate one string" to "headline + per-product why", parse and validate the richer response, and merge AI reasons onto the engine-built items by name. The route passes the richer shape through unchanged in logic.

### Changes Required:

#### 1. Richer schema + prompt

**File**: `src/lib/services/restocking-summary.ts`

**Intent**: Replace the single-string schema and the restate-only prompt with a prioritized-decision contract that still forbids changing order/actions/quantities/products.

**Contract**:
- Schema → `{ type: "object", additionalProperties: false, required: ["headline","items"], properties: { headline: {type:"string"}, items: { type:"array", items: { type:"object", additionalProperties:false, required:["product","reason"], properties: { product:{type:"string"}, reason:{type:"string"} } } } } }`.
- System prompt: instruct the model to write a one-sentence weekly headline and a one-line reason per product, grounded in the supplied facts (state, units, daysOfStock, leadTime, velocity), referencing each product by its exact name; explicitly **must not** change the order, actions, quantities, or invent products.
- The user payload keeps sending the ordered `candidates` (now including `leadTime`).

#### 2. Pure parse + merge helpers

**File**: `src/lib/services/restocking-summary.ts`

**Intent**: Validate the new response shape and merge AI prose onto engine items without letting the model alter anything structural — both pure and unit-testable.

**Contract**:
- `parsePlanResponse(body: unknown): { headline: string; items: { product: string; reason: string }[] } | null` — no throws; returns `null` on any structural mismatch (missing/non-string `headline`, `items` not an array, any item missing a string `product`/`reason`, non-JSON/truncated text).
- `mergeAiReasons(plan: RestockPlan, parsed): RestockPlan` — returns the deterministic `plan` with `headline` replaced by the AI headline and each item's `reason` replaced **only** when the AI supplied a reason for that exact `product`; unknown AI products are ignored; order/action/units/facts/items untouched.

#### 3. Service entry point

**File**: `src/lib/services/restocking-summary.ts`

**Intent**: Wire the new parse/merge into the existing build-deterministic-first, degrade-on-failure flow.

**Contract**: `summarizeRestockPlan` return type becomes `Promise<RestockPlan & { source: "ai" | "fallback" }>` (unchanged signature). Build the deterministic plan; throw `AiUnconfiguredError` if unset; on `res.ok && stop_reason === "end_turn"` and a non-null `parsePlanResponse`, return `{ ...mergeAiReasons(plan, parsed), source: "ai" }`; on any failure return `{ ...plan, source: "fallback" }`. Keep the `AbortController` timeout and `finally` clear.

#### 4. Route passthrough

**File**: `src/pages/api/restocking-plan/index.ts`

**Intent**: Carry the richer shape; the empty case now returns a headline.

**Contract**: No control-flow change. Empty short-circuit returns `{ ...buildDeterministicPlan([]), source: "empty" }` (now `{ headline, items: [] }`). Response body type is `RestockPlan & { source: "ai"|"fallback"|"empty" }`.

#### 5. Unit tests

**File**: `src/lib/services/restocking-summary.test.ts`

**Intent**: Cover the new parse + merge.

**Contract**: `parsePlanResponse` — valid response → object; missing `headline`, `items` not array, item missing `reason`, truncated JSON → `null`. `mergeAiReasons` — AI reason applied to the matching item; a hallucinated product in the AI response is dropped (item count/order unchanged); an engine item with no AI reason keeps its deterministic reason; actions/units/order never change.

### Success Criteria:

#### Automated Verification:
- Unit tests pass: `npm test`
- Lint/type check passes: `npm run lint`
- Build succeeds with `ANTHROPIC_API_KEY` unset: `npm run build`

#### Manual Verification:
- With a real key, a scratch invocation over sample candidates returns `source: "ai"` with an AI headline and per-item reasons in engine order; a response naming an unknown product drops it; with the key unset the route returns 503; a simulated non-200 yields `source: "fallback"` with deterministic reasons.

**Implementation Note**: Pause for human confirmation of a live AI round-trip (ai + fallback + hallucinated-product-dropped) before the island.

---

## Phase 3: Island — ranked list with "why" + inline facts

### Overview

Render the prioritized plan: a headline, then a ranked list where each row shows the engine action, the AI/deterministic reason, and a small deterministic facts line — so prose sits beside verifiable numbers.

### Changes Required:

#### 1. Rework the island render

**File**: `src/components/dashboard/RestockingPlan.tsx`

**Intent**: Replace the flat `weekly_summary` + `product → action` list with a headline + ranked rows carrying action, reason, and a facts line.

**Contract**: Update the local response type to the new `RestockPlan & { source }` shape. Render `headline`; for each item (already in urgency order) show product name, engine `action`, the `reason`, and a compact facts line derived from `daysOfStock`/`leadTime` (e.g. "Nd stock · Md lead"). Keep the `"fallback"` note, the `"empty"` headline message, `readError`, and disabled-while-pending. No new shared types beyond importing `RestockPlan`/item types from `@/lib/restocking`.

### Success Criteria:

#### Automated Verification:
- Lint/type check passes: `npm run lint`
- Build succeeds: `npm run build`
- Existing tests still pass: `npm test`

#### Manual Verification:
- Clicking the button shows a headline and a ranked list (most urgent first) with a "why" and a facts line per item; Watch rows say "Monitor" with a reason and no quantity.
- With the key unset, the labeled fallback shows deterministic reasons (engine numbers intact) — or a clear 503 message.
- An account with nothing to reorder shows the "Nothing to reorder this week" headline.
- Button disabled while pending; a network/500 error surfaces a readable message.

**Implementation Note**: Final phase — confirm all manual cases in the running app.

---

## Testing Strategy

### Unit Tests:
- `selectRestockCandidates` — urgency ordering across states; `leadTime` populated (Phase 1).
- `deterministicReason` / `buildDeterministicPlan` — factual reasons, Watch carries no quantity, headline + enriched items, empty headline (Phase 1).
- `parsePlanResponse` — valid → object; missing headline / non-array items / item missing reason / truncated → null (Phase 2).
- `mergeAiReasons` — AI reason applied by name; hallucinated product dropped; missing reason falls back; structure/order/actions unchanged (Phase 2).

### Integration Tests:
- None automated (no route/island harness). Covered by manual verification of the route's three response cases (Phase 2) and the island states (Phase 3).

### Manual Testing Steps:
1. Dashboard button → headline + ranked, explained list; Watch shows no quantity.
2. `POST /api/restocking-plan` → `source: "ai"` with headline + per-item reasons in engine order; unknown product dropped; 503 with key unset; `source: "empty"` with none.
3. Island renders AI plan, labeled fallback (deterministic reasons), and empty headline.

## Performance Considerations

One outbound LLM call per click, gated by the disabled-while-pending button; payload is a handful of products. The response is now slightly larger (per-item reason strings) but still small; `max_tokens` stays ~1024 and the `stop_reason` guard routes truncation to the deterministic fallback. The empty short-circuit still avoids a call when there is nothing to reorder.

## Migration Notes

No data migration. No new secret (reuses `ANTHROPIC_API_KEY`). The response body shape changes (`weekly_summary` → `headline`, richer `items`), but there is a single internal consumer (the island), updated in Phase 3.

## References

- Frame brief: `context/changes/ai-weekly-restocking-plan/frame.md`
- Shipped feature plan: `context/changes/ai-weekly-restocking-plan/plan.md`
- Engine: `src/lib/restocking.ts`, `src/lib/classification.ts:148-162`
- Service: `src/lib/services/restocking-summary.ts`
- Route: `src/pages/api/restocking-plan/index.ts`
- Island: `src/components/dashboard/RestockingPlan.tsx`
- Lessons: `context/foundation/lessons.md` (DB-boundary try/catch — unchanged by this plan)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Engine — urgency ordering, facts, deterministic reasons

#### Automated

- [x] 1.1 Unit tests pass: `npm test` — 9a51075
- [x] 1.2 Lint/type check passes: `npm run lint` — 9a51075
- [x] 1.3 Build succeeds: `npm run build` — 9a51075

#### Manual

- [x] 1.4 Test cases confirm urgency ordering and Watch reasons carry no order quantity — 9a51075

### Phase 2: Service + route — widen the AI contract

#### Automated

- [x] 2.1 Unit tests pass: `npm test` — e9fe1a5
- [x] 2.2 Lint/type check passes: `npm run lint` — e9fe1a5
- [x] 2.3 Build succeeds with `ANTHROPIC_API_KEY` unset: `npm run build` — e9fe1a5

#### Manual

- [x] 2.4 Live key → `source: "ai"` with headline + per-item reasons in engine order; unknown product dropped; unset → 503; non-200 → `source: "fallback"` with deterministic reasons — e9fe1a5

### Phase 3: Island — ranked list with "why" + inline facts

#### Automated

- [x] 3.1 Lint/type check passes: `npm run lint` — 322a34b
- [x] 3.2 Build succeeds: `npm run build` — 322a34b
- [x] 3.3 Existing tests still pass: `npm test` — 322a34b

#### Manual

- [x] 3.4 Button shows headline + ranked explained list (urgency order); Watch shows "Monitor" + reason, no quantity — 322a34b
- [x] 3.5 Key unset → labeled fallback with deterministic reasons (engine numbers intact) or clear 503 — 322a34b
- [x] 3.6 Account with nothing to reorder → "Nothing to reorder this week" headline — 322a34b
- [x] 3.7 Button disabled while pending; network/500 surfaces a readable message — 322a34b
