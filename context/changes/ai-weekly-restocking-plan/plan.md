# AI Weekly Restocking Plan (S-04) Implementation Plan

## Overview

Add the first AI feature: the owner clicks a button on `/dashboard` and gets one AI-generated **weekly restocking summary** built strictly from products the deterministic engine already classified `Understocked` or `Watch`. The engine makes every business decision (which products, the reorder quantity); the LLM only rewords the engine's existing output into a readable plan. A bad or unavailable LLM response can never corrupt a state or a quantity — it falls back to a deterministic, engine-built summary.

## Current State Analysis

The codebase is already shaped for this. From `context/changes/ai-weekly-restocking-plan/research.md`:

- **Classification is pure and exported.** `classify(product, entries)` (`src/lib/classification.ts:110`) returns `ClassificationResult` with `state`, `velocity`, `daysOfStock`, and a `recommendation` discriminated union. Only `Understocked` carries `{ kind: "order"; units }` (`:157-158`); `Watch` carries `{ kind: "none" }` (`:160-161`) — **no units**.
- **The only non-extracted logic** is the 13-line glue in `src/pages/dashboard.astro:21-37`: two batch fetches → group entries into `Map<product_id, SalesEntry[]>` → `classify` each → `groupProductsByState`.
- **Grouping already lives in `src/lib/dashboard.ts`** as the pure `groupProductsByState(items)`, with `ProductClassification`/`StateGroup` types. There is a passing unit test (`src/lib/dashboard.test.ts`) using `vitest`.
- **Secrets** are read via static imports from `astro:env/server`, declared in `astro.config.mjs` `env.schema` as `context:"server", access:"secret", optional:true`. Access is encapsulated in `src/lib` (e.g. `src/lib/supabase.ts:3-9` null-guards and returns `null` when unset); routes only handle the `null` → 503 case. **No `src/lib/services/` dir exists yet.**
- **Route convention** (`src/pages/api/products/index.ts`): `export const prerender = false`; 401 if no `context.locals.user`; 503 if `createClient` is `null`; `try/catch` → 500; `Response.json({ error }, { status })`.
- **Island convention**: React island mounted `client:load` from an Astro page passing server props (`src/pages/products.astro:27`); islands own their fetches to `/api/...`, use a local `readError(res, fallback)` helper (`ProductCatalog.tsx:20`) and `useState` for `pending`/`error`. Badge colors are shared via `STATE_STYLES` (`src/lib/classification-ui.ts`).
- **Provider decision** (research "Follow-up Research: LLM provider selection"): call the **Anthropic Messages API directly** (not OpenRouter) — `json_schema` constrained decoding is reliable and needs no beta header; OpenRouter's schema adherence varies per routed provider. Model `claude-haiku-4-5`. Key `ANTHROPIC_API_KEY`.
- This is the **first server-side outbound `fetch`** in the project; workerd exposes `fetch`/`AbortController` as globals — use directly, no SDK.

## Desired End State

On `/dashboard`, a "Generate weekly restocking plan" button calls `POST /api/restocking-plan`, which returns `{ weekly_summary, items: [{ product, action }], source }` — where `items` is always the engine-built list and `weekly_summary` is the only AI-authored field on the `"ai"` path. The island renders the summary plus a per-product action list. `source` is one of:

- `"ai"` — Anthropic reworded the engine's plan.
- `"fallback"` — the LLM call failed or returned unusable output; the engine-built plan is shown with a visible "AI summary unavailable — showing a basic plan" note.
- `"empty"` — no `Understocked`/`Watch` products; a "Nothing to reorder this week" message, no LLM call made.

Verification that the end state holds: `npm test` (pure selection/plan/parse logic), `npm run lint`, `npm run build` all pass; the dashboard button produces a plan; with the key unset the route returns 503 and/or the labeled fallback renders; an account with nothing to reorder shows the empty message.

### Key Discoveries:

- `src/pages/dashboard.astro:21-37` — the glue block to extract (Phase 1).
- `src/lib/dashboard.ts:24-43` + `:5-14` — where `classifyUserCatalog` and its types belong; `groupProductsByState` is the sibling pattern to mirror.
- `src/lib/classification.ts:157-161` — only `Understocked` has `units`; `Watch` does not. The deterministic action wording must be fixed here-derived, never by the LLM.
- `src/lib/supabase.ts:3-9` — the exact null-guard pattern to mirror for the Anthropic key.
- `src/pages/api/products/index.ts:6-25` — the route skeleton to mirror.
- `src/components/products/ProductCatalog.tsx:20,36-104` — island fetch/`readError`/`pending` pattern.
- `context/foundation/lessons.md` — every db-helper call from a route must be try/catch-wrapped (API → 500; null client → 503).

## What We're NOT Doing

- No new database tables, columns, or migrations. The plan is computed on demand from existing `products` + `sales_entries`.
- No persistence/history of generated plans, and no caching of LLM responses.
- No streaming of the LLM response; one request/response, structured JSON.
- No rate-limiting / debounce beyond a disabled-while-pending button (cost at this volume is negligible; revisit only if abused).
- No change to `classify()`, the engine rules, or the dashboard's existing grouped view.
- No new model selection UI — `claude-haiku-4-5` is fixed in the service.
- The LLM does **not** compute or alter any quantity, state, or product selection.

## Implementation Approach

Build inward-out along the existing seams: extract the shared classification glue (Phase 1), add the pure engine-side selection + deterministic plan that fixes every action *before* any LLM call (Phase 2), wrap the Anthropic call in a `src/lib/services` module that degrades to that deterministic plan (Phase 3), expose it through a conventional route that short-circuits the empty case (Phase 4), and surface it with a dashboard island (Phase 5). The deterministic plan built in Phase 2 is the single source of truth for both the LLM's input facts and the failure fallback, so the engine stays authoritative end to end.

## Critical Implementation Details

- **The LLM must not invent quantities.** Each candidate's `action` string is computed deterministically in Phase 2 from the engine's `recommendation` (`Understocked` → `"Order N units"` via the existing `recommendationText`; `Watch` → `"Monitor"`). The candidate facts (including the fixed `action`) are what the LLM receives, but **the LLM never produces the item list**: the response schema returns only `weekly_summary` (a prose paragraph), and the per-product `items` shown to the user are always taken from the deterministic plan (Phase 2). The system prompt instructs the model to restate, never recompute — and because the item list is engine-built regardless of the model's output, a hallucinated or prompt-injected response can only affect the summary wording, never a displayed product, quantity, or state.
- **Outbound fetch needs a hard timeout.** workerd has no long-lived process; wrap the Anthropic `fetch` in an `AbortController` with a timeout (e.g. ~10s) so a hung upstream call resolves into the fallback instead of wedging the request.
- **`stop_reason` guarding.** A `"refusal"` or `"max_tokens"` response yields unusable/truncated JSON. Check `res.ok` AND `stop_reason === "end_turn"` before parsing `content[0].text`; anything else → fallback.

---

## Phase 1: Extract `classifyUserCatalog` (zero behavior change)

### Overview

Lift the classification glue out of `dashboard.astro` into a pure, exported `src/lib/dashboard.ts` helper so the dashboard page and the new endpoint share one source of truth. No behavioral change to the dashboard.

### Changes Required:

#### 1. New pure helper in the dashboard lib

**File**: `src/lib/dashboard.ts`

**Intent**: Add `classifyUserCatalog(products, entries)` that reproduces exactly what `dashboard.astro:24-35` does today — group entries by `product_id`, then map each product to `{ product, classification: classify(...) }` — returning `ProductClassification[]`. Pure: no Supabase, no fetching; callers pass the already-loaded batches.

**Contract**: `export function classifyUserCatalog(products: Product[], entries: SalesEntry[]): ProductClassification[]`. Imports `classify` from `@/lib/classification` and `Product`/`SalesEntry` from `@/types`. Preserves input (name-sorted) order. Does not call `groupProductsByState` — selection (Phase 2) and grouping are separate consumers.

#### 2. Repoint the dashboard at the helper

**File**: `src/pages/dashboard.astro`

**Intent**: Replace the inline glue (`:24-35`, the `entriesByProduct` map + `items` map) with a single `classifyUserCatalog(products, entries)` call feeding `groupProductsByState`. Keep the existing `try/catch` → empty `groups` degradation and the `supabase && user` guard untouched.

**Contract**: Frontmatter now imports `classifyUserCatalog` alongside `groupProductsByState`; the `SalesEntry` type import and the manual `Map` construction are removed if no longer referenced. Rendered output is byte-identical.

#### 3. Unit test for the helper

**File**: `src/lib/dashboard.test.ts`

**Intent**: Add a `describe("classifyUserCatalog")` block mirroring the existing test's `makeProduct` helper. Assert it pairs each product with its `classify` result and that entries are matched to the right product by `product_id` (e.g. a product with enough history lands in a non-`Insufficient data` state; an unrelated product's entries don't leak across).

**Contract**: Uses real `classify` (not a stub) over small fixtures, in the existing `vitest` file.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Type checking / lint passes: `npm run lint`
- Production build succeeds: `npm run build`

#### Manual Verification:

- `/dashboard` renders the same grouped products as before for an account with sales data (no visual or ordering change).
- Empty/unconfigured states still degrade gracefully (no 500).

**Implementation Note**: After automated verification passes, pause for human confirmation that the dashboard is unchanged before proceeding.

---

## Phase 2: Pure restock selection + deterministic plan

### Overview

Add the engine-side, LLM-free core: select the `Understocked` + `Watch` products and fix each one's action deterministically, plus build a deterministic weekly plan used for both the empty case and the LLM-failure fallback. All pure and unit-tested — this is the explicitly-required selection test.

### Changes Required:

#### 1. New pure restocking module

**File**: `src/lib/restocking.ts`

**Intent**: Define the data contract and two pure functions:
- `selectRestockCandidates(items: ProductClassification[]): RestockCandidate[]` — keep only `state === "Understocked" || state === "Watch"`, preserving `STATE_ORDER` precedence (Understocked before Watch) and input order within each. Map each to a `RestockCandidate` carrying the engine facts plus a **deterministic `action`**: for `Understocked`, the existing `recommendationText(recommendation, state)` (→ `"Order N units"`); for `Watch`, `"Monitor"`. Never derive `units` for `Watch`.
- `buildDeterministicPlan(candidates: RestockCandidate[]): RestockPlan` — produce a plain-language `weekly_summary` (e.g. counts of items to order vs monitor) and `items: [{ product, action }]` straight from the candidates. For an empty list, a "Nothing to reorder this week" summary with `items: []`.

**Contract**:
```ts
export interface RestockCandidate {
  product: string;            // product.name
  state: "Understocked" | "Watch";
  units: number | null;       // Understocked only; null for Watch
  action: string;             // deterministic: "Order N units" | "Monitor"
  daysOfStock: number | null;
  velocity: number | null;
}
export interface RestockPlanItem { product: string; action: string; }
export interface RestockPlan { weekly_summary: string; items: RestockPlanItem[]; }
export function selectRestockCandidates(items: ProductClassification[]): RestockCandidate[];
export function buildDeterministicPlan(candidates: RestockCandidate[]): RestockPlan;
```
Imports `recommendationText` from `@/lib/classification` so the order wording cannot fork from the dashboard/detail views.

#### 2. Unit tests

**File**: `src/lib/restocking.test.ts`

**Intent**: Cover the selection invariants and the deterministic builder:
- `Understocked` candidate carries numeric `units` and `action === "Order N units"`.
- `Watch` candidate has `units === null` and `action === "Monitor"` — assert no quantity ever appears for Watch.
- `OK`, `Slow-mover`, `Insufficient data` are excluded.
- Ordering: Understocked precede Watch; empty input → `[]`.
- `buildDeterministicPlan` returns `items` matching the candidates' `product`/`action`, and the empty-case summary for `[]`.

**Contract**: New `vitest` file mirroring `dashboard.test.ts` fixture style; uses real `classify` outputs or hand-built `ProductClassification` fixtures.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Lint/type check passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification:

- Review the test cases confirm Watch never emits a quantity and excluded states are truly excluded.

**Implementation Note**: Pure logic — automated verification is sufficient; no manual UI step. Pause for human confirmation of the test coverage before Phase 3.

---

## Phase 3: Anthropic service module + secret wiring

### Overview

Add the `src/lib/services` module that turns candidates into an AI-reworded plan via the Anthropic Messages API, encapsulating the secret and degrading to the deterministic plan on any failure. Declare the `ANTHROPIC_API_KEY` secret following the project's env conventions.

### Changes Required:

#### 1. Declare the secret

**Files**: `astro.config.mjs`, `.env.example`

**Intent**: Add `ANTHROPIC_API_KEY` to the `env.schema` mirroring the Supabase entries; add a placeholder line to `.env.example`. `optional: true` so build/boot/CI don't fail when unset.

**Contract**: `ANTHROPIC_API_KEY: envField.string({ context: "server", access: "secret", optional: true })` in `astro.config.mjs:18-21`; `ANTHROPIC_API_KEY=###` in `.env.example`. (Local runtime via `.dev.vars`; deploy via `npx wrangler secret put ANTHROPIC_API_KEY` — operational, not a code change.)

#### 2. Pure response-parse helper

**File**: `src/lib/services/restocking-summary.ts` (helper exported for test)

**Intent**: A pure `parseSummaryResponse(body): { weekly_summary: string } | null` that validates the Anthropic response shape — extracts `content[0].text`, `JSON.parse`s it, and checks it matches `{ weekly_summary: string }`. Returns `null` on any structural mismatch so the caller can fall back. (The LLM is not asked for `items`; the item list is always engine-built — see Critical Implementation Details.) Keeping parse pure makes the guard logic unit-testable without the network.

**Contract**: `export function parseSummaryResponse(body: unknown): { weekly_summary: string } | null`. No throws — returns `null` on bad input.

#### 3. Service entry point

**File**: `src/lib/services/restocking-summary.ts`

**Intent**: 
- `isConfigured(): boolean` — null-guard on `ANTHROPIC_API_KEY` (mirrors `supabase.ts`), so the route can return 503 cleanly.
- `summarizeRestockPlan(candidates: RestockCandidate[]): Promise<RestockPlan & { source: "ai" | "fallback" }>` — build the deterministic plan first; if not configured, throw a typed `AiUnconfiguredError` (route → 503). Otherwise `fetch` the Anthropic Messages API (`claude-haiku-4-5`, `max_tokens` ~1024, a `json_schema` requesting **only** `weekly_summary`) with an `AbortController` timeout, a system prompt instructing restate-not-recompute, and the candidates as the user payload. Guard `res.ok` AND `stop_reason === "end_turn"`, then `parseSummaryResponse`. On success return `{ weekly_summary: parsed.weekly_summary, items: deterministicPlan.items, source: "ai" }` — the AI supplies only the summary prose; **`items` always come from the deterministic plan**. On **any** failure (non-ok, bad stop_reason, parse null, network/timeout) return `{ ...deterministicPlan, source: "fallback" }`.

**Contract**: The returned plan type extends `RestockPlan` with `source: "ai" | "fallback"` (the route adds `"empty"`). The `json_schema` sent to Anthropic requests **only** `{ weekly_summary: string }` (object `additionalProperties:false`, `weekly_summary` required) — it does **not** request `items`. The deterministic `items` (engine-authoritative) are used for display on **both** the `"ai"` and `"fallback"` paths; the model contributes the summary prose only and can never alter a displayed product, quantity, or state. (This narrows the schema shown in research's "Exact fetch shape", which still listed `items`.) Errors inside the fetch are caught here, never propagated, except `AiUnconfiguredError`.

#### 4. Unit test for the parse helper

**File**: `src/lib/services/restocking-summary.test.ts`

**Intent**: Test `parseSummaryResponse` against: a well-formed Anthropic response carrying `weekly_summary` (→ `{ weekly_summary }`), a `max_tokens`-truncated/invalid JSON body (→ `null`), a structurally-wrong JSON (missing or non-string `weekly_summary`) (→ `null`).

**Contract**: New `vitest` file; pure, no network.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Lint/type check passes: `npm run lint`
- Build succeeds (with `ANTHROPIC_API_KEY` unset, confirming `optional`): `npm run build`

#### Manual Verification:

- With a real key in `.dev.vars`, a scratch invocation of `summarizeRestockPlan` over sample candidates returns `source: "ai"` and a sensible summary; with the key unset it throws `AiUnconfiguredError`; simulating a non-200 returns `source: "fallback"`.
- Note: the **first** call against a new `json_schema` pays a one-time compilation cost (cached ~24h), so a rare cold-start call could approach the `AbortController` timeout and degrade to `source: "fallback"`. This is self-healing — retry once; don't mistake a cold-start fallback for a broken integration.

**Implementation Note**: Pause for human confirmation of a live AI round-trip (and the fallback path) before wiring the route.

---

## Phase 4: `POST /api/restocking-plan` route

### Overview

Expose the feature through a conventional API route that orchestrates load → classify → select → (empty short-circuit | summarize), mirroring `api/products/index.ts`.

### Changes Required:

#### 1. New route

**File**: `src/pages/api/restocking-plan/index.ts`

**Intent**: `POST` handler: 401 if no `context.locals.user`; `createClient` null → 503 ("Supabase is not configured"); `isConfigured()` false → 503 ("AI summary is not configured"). In a `try/catch` (→ 500, per the lessons rule): `getProductsByUser` + `getSalesEntriesByUser`, `classifyUserCatalog`, `selectRestockCandidates`. If candidates is empty, return `buildDeterministicPlan([])` with `source: "empty"` (200) — **no LLM call**. Otherwise `await summarizeRestockPlan(candidates)` and return it (200). `AiUnconfiguredError` from the service maps to 503 (belt-and-suspenders with the upfront check).

**Contract**: `export const prerender = false;` `export const POST: APIRoute`. Response body `{ weekly_summary: string, items: {product,action}[], source: "ai"|"fallback"|"empty" }`. Error bodies `{ error }` with statuses 401/503/500. No request body needed (selection is derived server-side from the authed user); a `GET` may be omitted.

### Success Criteria:

#### Automated Verification:

- Lint/type check passes: `npm run lint`
- Build succeeds: `npm run build`
- Existing tests still pass: `npm test`

#### Manual Verification:

- Authenticated `POST /api/restocking-plan` with Understocked/Watch products returns 200 `{ weekly_summary, items, source: "ai" }`.
- With `ANTHROPIC_API_KEY` unset → 503 `{ error: "AI summary is not configured" }`.
- An account with no Understocked/Watch products → 200 `source: "empty"`, and no Anthropic request is made (verify via logs/no outbound call).
- Unauthenticated request → 401.

**Implementation Note**: Pause for human confirmation of the three response cases (via the app or curl) before building the island.

---

## Phase 5: Dashboard island (button + result panel)

### Overview

Add a React island to `/dashboard` that triggers the endpoint and renders the plan, with labeled `fallback` and `empty` states.

### Changes Required:

#### 1. Restocking-plan island

**File**: `src/components/dashboard/RestockingPlan.tsx`

**Intent**: A `client:load` island with a "Generate weekly restocking plan" button. On click: `pending` state, `POST /api/restocking-plan`, `readError(res, fallback)` on non-ok (mirroring `ProductCatalog.tsx`). On success, store the `RestockPlan & { source }` and render `weekly_summary` + an `items` list (product + action). Show a small note when `source === "fallback"` ("AI summary unavailable — showing a basic plan") and a "Nothing to reorder this week" message when `source === "empty"`. Reuse `STATE_STYLES`/`Button` for visual consistency where helpful.

**Contract**: Local `readError` helper + `useState` for `pending`/`error`/`plan`, following the existing island pattern. No new shared types beyond importing `RestockPlan`/item types from `@/lib/restocking`. No Next.js directives.

#### 2. Mount on the dashboard

**File**: `src/pages/dashboard.astro`

**Intent**: Render `<RestockingPlan client:load />` in the dashboard (e.g. near the header / above the grouped products), without disturbing the existing SSR grouped view.

**Contract**: Add the import and one `client:load` mount; no change to the existing `groups` rendering.

### Success Criteria:

#### Automated Verification:

- Lint/type check passes: `npm run lint`
- Build succeeds: `npm run build`
- Existing tests still pass: `npm test`

#### Manual Verification:

- Clicking the button on an account with Understocked/Watch products shows a coherent weekly plan (AI wording) with per-product actions; Watch items say "Monitor" with no quantity.
- With the key unset, the UI shows the labeled fallback plan (engine numbers intact) — or a clear message if the route returned 503.
- An account with nothing to reorder shows the "Nothing to reorder this week" message.
- Button is disabled while pending; a network/500 error surfaces a readable message, not a crash.

**Implementation Note**: Final phase — confirm all manual cases in the running app.

---

## Testing Strategy

### Unit Tests:

- `classifyUserCatalog` — pairs products with `classify` results; entries matched by `product_id` (Phase 1).
- `selectRestockCandidates` — only Understocked+Watch; Understocked has `units`+"Order N units"; Watch has `null` units + "Monitor"; excluded states excluded; ordering (Phase 2).
- `buildDeterministicPlan` — items mirror candidates; empty-case summary (Phase 2).
- `parseSummaryResponse` — valid `weekly_summary` → parsed object; truncated/invalid/missing `weekly_summary` → `null` (Phase 3).

### Integration Tests:

- None automated (no test harness for routes/islands in this project). Covered by manual verification of the route's three response cases (Phase 4) and the island's states (Phase 5).

### Manual Testing Steps:

1. Dashboard unchanged after Phase 1 refactor.
2. `POST /api/restocking-plan` returns `source: "ai"` with products; 503 with key unset; `source: "empty"` with none; 401 unauthenticated.
3. Island renders AI plan, labeled fallback, and empty message; Watch shows no quantity; button disables while pending.

## Performance Considerations

One outbound LLM call per button click, gated by a disabled-while-pending button; payload is a handful of products so token cost is well under 1¢/call. The `AbortController` timeout bounds worst-case latency and prevents a hung upstream from holding the Worker. The empty-case short-circuit avoids spending tokens when there's nothing to reorder.

Note on `max_tokens` (~1024): since the LLM now returns only the `weekly_summary` prose (the item list is engine-built), the response is small and the cap is unlikely to bind. A very large catalog with a long summary could still hit `max_tokens` → the `stop_reason` guard routes it to the deterministic fallback. That degradation is safe and correct — treat a large-catalog `source: "fallback"` as expected, not a bug, during verification. Revisit (cap candidate count or scale `max_tokens`) only if real catalogs grow large enough for this to bind in practice.

## Migration Notes

No data migration. New secret `ANTHROPIC_API_KEY` must be provisioned per environment: `.dev.vars` locally, `npx wrangler secret put ANTHROPIC_API_KEY` for the deployed Worker. With `optional: true`, absence degrades to 503 / labeled fallback rather than breaking the build or CI.

## References

- Internal + external research: `context/changes/ai-weekly-restocking-plan/research.md`
- Change identity: `context/changes/ai-weekly-restocking-plan/change.md`
- Glue to extract: `src/pages/dashboard.astro:21-37`
- Route to mirror: `src/pages/api/products/index.ts`
- Secret null-guard pattern: `src/lib/supabase.ts:3-9`
- Island fetch pattern: `src/components/products/ProductCatalog.tsx:20,36-104`
- Recurring rule: `context/foundation/lessons.md` (wrap throw-on-error db calls at boundaries)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Extract `classifyUserCatalog` (zero behavior change)

#### Automated

- [x] 1.1 Unit tests pass: `npm test`
- [x] 1.2 Type checking / lint passes: `npm run lint`
- [x] 1.3 Production build succeeds: `npm run build`

#### Manual

- [x] 1.4 `/dashboard` renders identically for an account with sales data
- [x] 1.5 Empty/unconfigured states still degrade gracefully (no 500)

### Phase 2: Pure restock selection + deterministic plan

#### Automated

- [ ] 2.1 Unit tests pass: `npm test`
- [ ] 2.2 Lint/type check passes: `npm run lint`
- [ ] 2.3 Build succeeds: `npm run build`

#### Manual

- [ ] 2.4 Test cases confirm Watch never emits a quantity and excluded states are excluded

### Phase 3: Anthropic service module + secret wiring

#### Automated

- [ ] 3.1 Unit tests pass: `npm test`
- [ ] 3.2 Lint/type check passes: `npm run lint`
- [ ] 3.3 Build succeeds with `ANTHROPIC_API_KEY` unset (confirms `optional`): `npm run build`

#### Manual

- [ ] 3.4 Live key → `source: "ai"`; unset → `AiUnconfiguredError`; simulated non-200 → `source: "fallback"`

### Phase 4: `POST /api/restocking-plan` route

#### Automated

- [ ] 4.1 Lint/type check passes: `npm run lint`
- [ ] 4.2 Build succeeds: `npm run build`
- [ ] 4.3 Existing tests still pass: `npm test`

#### Manual

- [ ] 4.4 Authed POST with products → 200 `source: "ai"`
- [ ] 4.5 Key unset → 503 `{ error: "AI summary is not configured" }`
- [ ] 4.6 No Understocked/Watch → 200 `source: "empty"`, no Anthropic call made
- [ ] 4.7 Unauthenticated → 401

### Phase 5: Dashboard island (button + result panel)

#### Automated

- [ ] 5.1 Lint/type check passes: `npm run lint`
- [ ] 5.2 Build succeeds: `npm run build`
- [ ] 5.3 Existing tests still pass: `npm test`

#### Manual

- [ ] 5.4 Button shows AI plan with per-product actions; Watch shows "Monitor", no quantity
- [ ] 5.5 Key unset → labeled fallback (engine numbers intact) or clear 503 message
- [ ] 5.6 Account with nothing to reorder → "Nothing to reorder this week"
- [ ] 5.7 Button disabled while pending; network/500 surfaces a readable message
