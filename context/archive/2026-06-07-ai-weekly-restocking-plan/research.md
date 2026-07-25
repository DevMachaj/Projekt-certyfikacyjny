---
date: 2026-06-07T14:41:25+0200
researcher: Claude (10x-research)
git_commit: a10a8daa4e7daa6acbacd8935aaa0c38e0752e48
branch: main
repository: Projekt certyfikacyjny
topic: "Dashboard product fetch + classification grouping, classify() shape, and the integration point for a new LLM restocking-summary endpoint"
tags: [research, codebase, dashboard, classification, api-routes, cloudflare-env, llm]
status: complete
last_updated: 2026-06-07
last_updated_by: Claude (10x-research)
last_updated_note: "Added external research for LLM provider selection (Anthropic Messages API vs OpenRouter)"
---

# Research: Integration point for an AI weekly restocking-summary endpoint

**Date**: 2026-06-07T14:41:25+0200
**Researcher**: Claude (10x-research)
**Git Commit**: a10a8daa4e7daa6acbacd8935aaa0c38e0752e48
**Branch**: main
**Repository**: Projekt certyfikacyjny

## Research Question

How does `/dashboard` currently fetch the user's products and group them by classification state? Where exactly is `classify()` called server-side, and what is the full shape of `ClassificationResult` and `Recommendation`? I need the precise integration point for a new endpoint that gathers all Understocked + Watch products into a single payload to send to an LLM. Also: how do API routes in this project read secrets / environment variables on the Cloudflare Workers runtime?

## Summary

- **Everything the new endpoint needs already exists as importable, pure `src/lib` functions.** The only logic that lives _only_ inside `dashboard.astro` is a ~13-line glue block (fetch both batches → group entries by `product_id` → `classify` each). To build the endpoint, either copy that glue or extract it into a shared `src/lib` helper.
- **Data flow**: `Astro.locals.user` (set by middleware) → `getProductsByUser` + `getSalesEntriesByUser` (two batch queries, no N+1) → group entries into `Map<product_id, SalesEntry[]>` → `classify(product, entries)` per product → `groupProductsByState(items)` → render Astro `ProductCard`s.
- **Classification states are**: `"Understocked" | "Watch" | "OK" | "Slow-mover" | "Insufficient data"` (`src/types.ts:1`). There is **no "Healthy"/"Overstocked"** — `OK` and `Slow-mover` are the closest.
- **Critical for the LLM payload**: only **Understocked** carries an order quantity (`recommendation: { kind: "order"; units }`). **Watch produces `recommendation: { kind: "none" }`** — no `units`. For Watch products the payload must rely on `velocity`, `daysOfStock`, `stock_quantity`, `lead_time_days`, `buffer_days`.
- **Secrets**: read via statically-imported bindings from `astro:env/server` (NOT `getSecret()`), declared in `astro.config.mjs` `env.schema` as `context: "server", access: "secret", optional: true`. Secret access is encapsulated in `src/lib` (e.g. `supabase.ts`), never inline in routes. Runtime values: `.dev.vars` (Cloudflare local dev), `wrangler secret put` (deployed), GitHub repo secrets (CI build).
- This endpoint introduces the **first server-side outbound `fetch`** in the project. Use the workerd global `fetch` directly.

## Detailed Findings

### Dashboard data flow — `src/pages/dashboard.astro`

The frontmatter (lines 1–46) does all the work; render (lines 78–106) just maps over groups.

- Current user from middleware-populated locals — `src/pages/dashboard.astro:10`: `const { user } = Astro.locals;`
- Supabase client (can be `null` if env unset) — `:15`: `const supabase = createClient(Astro.request.headers, Astro.cookies);`
- Guard `if (supabase && user)` (`:19`); the whole block is wrapped in try/catch that degrades to empty `groups` on error (`:38–42`) — per the team lesson on wrapping throw-on-error db calls.
- Two batch fetches (deliberately not per-product):
  - `:21` `const products = await getProductsByUser(supabase, user.id);`
  - `:22` `const entries  = await getSalesEntriesByUser(supabase, user.id);`
- Group entries by product, classify, bucket (`:24–37`):

```ts
const entriesByProduct = new Map<string, SalesEntry[]>();
for (const entry of entries) {
  /* push into map keyed by entry.product_id */
}

const items: ProductClassification[] = products.map((product) => ({
  product,
  classification: classify(product, entriesByProduct.get(product.id) ?? []),
}));

groups = groupProductsByState(items);
```

**This block (`dashboard.astro:24–37`) is the exact pattern to reuse for the LLM-payload endpoint.**

### Grouping — `src/lib/dashboard.ts`

Grouping is a pure `src/lib` function, not in a component.

- `groupProductsByState(items: ProductClassification[]): StateGroup[]` — `src/lib/dashboard.ts:24-43`. Buckets into a `Map<ClassificationState, ProductClassification[]>`, emits groups in fixed `STATE_ORDER`, omitting empty states; preserves input order (products already name-sorted).
- Types (`:5-14`):

```ts
interface ProductClassification {
  product: Product;
  classification: ClassificationResult;
}
interface StateGroup {
  state: ClassificationState;
  items: ProductClassification[];
}
```

- `STATE_ORDER` — `src/lib/classification.ts:64`: `["Understocked", "Watch", "OK", "Slow-mover", "Insufficient data"]`. Understocked + Watch are the first two buckets.

### `classify()` — `src/lib/classification.ts`

Pure, dependency-free (imports types only), server-side only. Never throws, never null.

- Definition — `src/lib/classification.ts:110`: `export function classify(product: Product, entries: SalesEntry[]): ClassificationResult`
- Input is a single product plus **that product's** entries (callers group entries per-product first).
- Evaluation order (`:13-16`): Insufficient → Slow-mover → Understocked → Watch → OK. Key branches:
  - `totalDays < 7` → `"Insufficient data"`, `{ kind: "none" }`
  - `velocity < 0.1` → `"Slow-mover"`, `{ kind: "promote" }`
  - `daysOfStock >= 90` → `"Slow-mover"`, `{ kind: "promote" }`
  - `lead_time_days == null` → `"OK"`, `{ kind: "set-lead-time" }`
  - `daysOfStock < leadTime` → **`"Understocked"`**, `{ kind: "order", units: Math.ceil(velocity * (leadTime + product.buffer_days)) }` (`:157-158`)
  - `daysOfStock < 2 * leadTime` → **`"Watch"`**, recommendation stays base `{ kind: "none" }` (`:160-161`)
  - else → `"OK"`, `{ kind: "none" }`

### `ClassificationResult` — full shape (`src/lib/classification.ts:34-46`)

```ts
export interface ClassificationResult {
  state: ClassificationState;
  velocity: number | null; // units/day over all history; null when no history
  daysOfStock: number | null; // stock_quantity ÷ velocity; null when velocity unavailable
  totalDays: number; // inclusive calendar days across non-overlapping entries
  totalUnits: number;
  thresholdLabel: string; // = THRESHOLD_DEFINITIONS[state], human-readable
  recommendation: Recommendation;
}
```

`ClassificationState` — `src/types.ts:1`:

```ts
export type ClassificationState = "Understocked" | "Watch" | "OK" | "Slow-mover" | "Insufficient data";
```

### `Recommendation` — full shape (`src/lib/classification.ts:28-32`)

```ts
export type Recommendation =
  | { kind: "order"; units: number }
  | { kind: "promote" }
  | { kind: "set-lead-time" }
  | { kind: "none" };
```

"Order X units" is the `{ kind: "order"; units }` variant, built at `:157`. Human-readable rendering: `recommendationText(rec, state)` — `:71-84` — returns `` `Order ${rec.units} units` `` for the order kind.

⚠️ **Watch has no `units`.** Only Understocked carries `{ kind: "order", units }`. Watch products have a state + `velocity`/`daysOfStock` but no order figure.

### Every server-side `classify()` call site

1. `src/pages/dashboard.astro:34` — SSR page; batch pattern (the one to reuse).
2. `src/pages/products/[id].astro:25` — detail page SSR; result passed to `<ProductDetail>` island as `initialClassification`.
3. `src/pages/api/products/[id]/sales-entries/index.ts:46` — `GET`; returns `{ entries, classification }`.
4. `src/pages/api/products/[id]/sales-entries/index.ts:108` — `POST`; recompute after insert, returns `{ entry, classification }`.
5. `src/pages/api/products/[id]/sales-entries/[entryId].ts:38` — `DELETE`; recompute after delete, returns `{ classification }`.

(Test calls in `classification.test.ts` excluded.)

### DB helpers — `src/lib/db.ts`

All take `(supabase, userId|id)`, `select("*")`, throw on error, rely on RLS for per-user scoping.

- `getProductsByUser(supabase, userId): Promise<Product[]>` — `:6`, name-sorted ascending.
- `getSalesEntriesByUser(supabase, userId): Promise<SalesEntry[]>` — `:78`, sorted by `start_date`.
- `getSalesEntriesByProduct(supabase, productId): Promise<SalesEntry[]>` — `:67`.
- `getProductById(supabase, id): Promise<Product | null>` — `:57`.

Row shapes — `src/types.ts`:

```ts
Product:    { id, user_id, name, stock_quantity, lead_time_days: number|null, buffer_days, created_at, updated_at }  // :3-12
SalesEntry: { id, product_id, user_id, units_sold, start_date, end_date, created_at }                                 // :14-22
```

### Render layer

Dashboard renders **no React island** — it uses `src/components/dashboard/ProductCard.astro` (props `{ product, classification }`, `:7-10`), which calls `recommendationText()` and uses `STATE_STYLES` from `src/lib/classification-ui.ts`. The React islands consuming classification (`ClassificationPanel.tsx`, `ProductDetail.tsx`) are on the product **detail** page, not the dashboard.

### Secrets / env on Cloudflare Workers

**Read pattern** — statically-imported bindings from `astro:env/server` (NOT `getSecret()`):

- `src/lib/supabase.ts:3` `import { SUPABASE_URL, SUPABASE_KEY } from "astro:env/server";`, guarded `if (!SUPABASE_URL || !SUPABASE_KEY) return null;` (`:6`).
- `src/lib/config-status.ts:1,14`.
- **API routes never read secrets directly** — they call `createClient(...)` from `@/lib/supabase` and only handle the `null` (unconfigured → 503) case. Mirror this: put LLM-key access in a `src/lib/services/` module.

**Schema** — `astro.config.mjs:17-22` (`envField` imported `:2`):

```js
env: {
  schema: {
    SUPABASE_URL: envField.string({ context: "server", access: "secret", optional: true }),
    SUPABASE_KEY: envField.string({ context: "server", access: "secret", optional: true }),
  },
},
```

`context: "server"` (never sent to client), `access: "secret"` (read at runtime, not inlined into the public bundle), `optional: true` (app boots even when unset → hence the null guards).

**Runtime provisioning** (three environments):
| Environment | Source |
|---|---|
| Cloudflare local dev (`npm run dev`, workerd) | `.dev.vars` (gitignored) |
| Deployed Worker (`npx wrangler deploy`) | `npx wrangler secret put NAME` / dashboard |
| CI (GitHub Actions build) | repository secrets |

`.env.example` (committed) is the placeholder template. `wrangler.jsonc` (no `.toml`) defines worker `stockhelper`, `nodejs_compat`, `compatibility_date: "2026-05-08"`, `ASSETS` binding, `SESSION` KV namespace — secrets are NOT listed there.

**To add an LLM key, touch four places:** (1) `astro.config.mjs` schema line, (2) `.env.example`, (3) local `.dev.vars`, (4) `wrangler secret put` for deploy (+ GitHub repo secret only if the build needs it — with `optional: true` it won't break CI).

### Representative API-route conventions — `src/pages/api/products/index.ts`

Structure to mirror: `export const prerender = false`; per-method `APIRoute` handlers; auth gate `context.locals.user` → 401; `createClient` null-guard → 503; JSON parse try/catch → 400 "Invalid JSON body"; zod `.safeParse()` → 400 with `issues`; DB work try/catch → 500.

Standard error shape: `Response.json({ error: "<message>" }, { status })`; validation adds `issues: parsed.error.issues`; 204 uses `new Response(null, { status: 204 })`. Status codes in use: 200/201/204, 400, 401, 404, 409 (conflict — see sales-entries), 500, 503.

Zod conventions (`src/lib/validation/product.ts`): schemas in `src/lib/validation/`, export both schema and `z.infer` type, `.safeParse()` in routes.

### External fetch / workerd

No server-side outbound `fetch` exists yet — all current `fetch` calls are client-side islands hitting the project's own `/api/...` (`ProductDetail.tsx:57,85`, `ProductCatalog.tsx:66,96`). The LLM endpoint introduces the first outbound fetch. workerd notes: `fetch`/`Response`/`Request`/`Headers`/`AbortController` are globals — use directly, no `node-fetch`. `nodejs_compat` is on if an SDK needs Node APIs, but the lowest-risk path is a thin `src/lib/services/<provider>.ts` doing `fetch(url, { headers: { Authorization: \`Bearer ${KEY}\` }, ... })`at request time, with the key pulled from`astro:env/server` inside the lib.

## Code References

- `src/pages/dashboard.astro:21-37` — **the glue block to reuse**: batch fetch → group → classify → group-by-state
- `src/pages/dashboard.astro:10,15,19,38-42` — user/client resolution and error degradation
- `src/lib/dashboard.ts:5-14,24-43` — `ProductClassification`, `StateGroup`, `groupProductsByState`
- `src/lib/classification.ts:110-164` — `classify()`
- `src/lib/classification.ts:34-46` — `ClassificationResult`
- `src/lib/classification.ts:28-32` — `Recommendation`
- `src/lib/classification.ts:64` — `STATE_ORDER`
- `src/lib/classification.ts:71-84` — `recommendationText()`
- `src/lib/classification.ts:52` — `THRESHOLD_DEFINITIONS` (per-state human definitions, useful LLM context)
- `src/types.ts:1` — `ClassificationState` union
- `src/types.ts:3-12,14-22` — `Product`, `SalesEntry` row shapes
- `src/lib/db.ts:6,57,67,78` — data loaders
- `src/lib/supabase.ts:3,6,9` — secret read + null-guard pattern
- `astro.config.mjs:2,17-22` — `env.schema`
- `src/pages/api/products/index.ts` — canonical API-route structure to mirror
- `src/lib/validation/product.ts` — zod schema convention

## Architecture Insights

- **Pure-function core, glue at the edges.** `classify` and `groupProductsByState` are pure and already exported; the only non-extracted logic is the per-page glue. Cleanest move: extract `dashboard.astro:24-37` into a `src/lib/dashboard.ts` helper (e.g. `classifyUserCatalog(products, entries): ProductClassification[]`) and have both the dashboard page and the new endpoint call it — removes duplication and keeps a single source of truth.
- **Secret access is encapsulated in `src/lib`, never in routes** — follow this for the LLM key.
- **Degrade-gracefully convention**: `optional: true` secrets + null-guarded clients + try/catch at SSR/API boundaries (the recorded team lesson). The endpoint should return 503 when the LLM key/service is unconfigured, mirroring the Supabase 503.
- **The AI only summarizes; the engine decides.** Per `change.md`, the deterministic `classify` output is authoritative. The endpoint should pass already-computed states/recommendations to the LLM and treat the LLM purely as a wording layer — never let it recompute or alter `units`/state.

## Historical Context (from prior changes)

- `context/foundation/lessons.md` — "Wrap throw-on-error DB calls at SSR/API boundaries": every call to a `src/lib/db.ts` helper from a route/page must be try/catch-wrapped (API → `Response.json({ error }, { status: 500 })`; null `createClient` → 503). The new endpoint must follow this.
- `context/changes/ai-weekly-restocking-plan/change.md` — roadmap slice S-04, prereq S-03; first LLM integration; PRD refs US-01, FR-006 (Understocked/Watch select inclusion), FR-007 ("Order X units" action restated per product).

## Open Questions

1. **Watch products have no `units`.** FR-007 restates "Order X units" — but Watch carries `{ kind: "none" }`. Should the summary (a) include Watch as "monitor, no order yet" without a quantity, or (b) only Understocked products get an order line and Watch is a separate "keep an eye on" section? (Recommend (b), surfaced explicitly.)
2. ~~**Which LLM provider / model** and what env-var name?~~ **RESOLVED** — see "Follow-up Research: LLM provider selection" below. Decision: Anthropic Messages API direct, `claude-haiku-4-5`, env var `ANTHROPIC_API_KEY`.
3. **Response contract** of the new endpoint — return raw summary text, or a structured `{ summary, productsConsidered }`? And is the trigger a button hitting a `POST /api/...` route returning the summary for a React island to render?
4. **Empty-state behavior** — when zero Understocked/Watch products exist, skip the LLM call and return a canned "nothing to reorder" message (saves a token spend and avoids hallucinated content).

## Related Research

None yet — this is the first research artifact for `ai-weekly-restocking-plan`.

## Follow-up Research: LLM provider selection [2026-06-07]

External research (Anthropic structured-outputs docs + exa web search on OpenRouter) to pick the LLM provider for the single server-side summarization call from the Cloudflare/workerd runtime. Requirements: cheap, reliable structured output, simple `fetch`-based call (no SDK that breaks on Workers).

### Decision: call the Anthropic Messages API directly (not OpenRouter)

Both options are plain-`fetch` and workerd-compatible. The deciding axis is **structured-output reliability**:

- **Anthropic direct** — `output_config.format` (`json_schema`) uses constrained decoding, so schema adherence is guaranteed on `claude-haiku-4-5`, and **no beta header is required** anymore (`structured-outputs-2025-11-13` still works for a transition period but is optional). One account, one network hop.
  - Source: `https://platform.claude.com/docs/en/build-with-claude/structured-outputs.md` — confirms no beta header required and `claude-haiku-4-5` is in the GA list.
- **OpenRouter** — OpenAI-shaped, also plain `fetch`, but `json_schema` support is **per-routed-provider, not per-model**. A model can advertise schema support while the provider OpenRouter routes to silently falls back to `json_object`; you must set `provider.require_parameters: true` to avoid it. OpenRouter shipped a "Response Healing" plugin because malformed JSON is common — and that only fixes JSON _syntax_, not _schema adherence_.
  - Sources: OpenRouter Structured Outputs docs; `github.com/simonw/llm-openrouter` issue #28 (documents the provider-fallback-to-`json_object` trap firsthand); OpenRouter Response Healing blog/docs.

OpenRouter's value (multi-model failover, marketplace) is irrelevant to one cheap call. Cost is a wash at this volume; OpenRouter adds a small credit fee.

### Chosen config

- **Model:** `claude-haiku-4-5` — cheapest current Claude with structured-output support (~$1/1M input, $5/1M output; a weekly-restock summary is well under 1¢/call).
- **Env var:** `ANTHROPIC_API_KEY` — add to `astro.config.mjs` `env.schema` as `envField.string({ context: "server", access: "secret", optional: true })`; read inside a `src/lib/services/` module via `import { ANTHROPIC_API_KEY } from "astro:env/server"` with a null-guard (route → 503 when unconfigured, mirroring Supabase). Local: `.dev.vars`; deployed: `npx wrangler secret put ANTHROPIC_API_KEY`.
- **No SDK** — workerd global `fetch` only.

### Exact fetch shape

```ts
const res = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: {
    "x-api-key": ANTHROPIC_API_KEY,
    "anthropic-version": "2023-06-01",
    "content-type": "application/json",
  },
  body: JSON.stringify({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    system:
      "Summarize the provided restock recommendations into a short weekly plan. " +
      "Do not invent products, quantities, or states — only restate what is given.",
    messages: [{ role: "user", content: JSON.stringify(payload) }],
    output_config: {
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          additionalProperties: false, // required by structured outputs
          required: ["weekly_summary", "items"],
          properties: {
            weekly_summary: { type: "string" },
            items: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["product", "action"],
                properties: {
                  product: { type: "string" },
                  action: { type: "string" }, // "Order 40 units" (Understocked) | "Monitor" (Watch)
                },
              },
            },
          },
        },
      },
    },
  }),
});
```

### Forcing strictly parseable output

- `output_config.format` with a `json_schema` is the mechanism — constrained decoding guarantees the response matches the schema; **no beta header needed**. The JSON arrives as the text block: parse `responseBody.content[0].text`.
- **Schema constraints to respect:** every object needs `additionalProperties: false`. **Not supported:** `minLength`/`maxLength`, `minimum`/`maximum`, recursive schemas — keep it flat.
- **Guard the response, not just the fetch:** check `res.ok`, then `stop_reason`. `"refusal"` (safety) or `"max_tokens"` (truncated → JSON won't parse) mean the payload is unusable → fall back to a deterministic, engine-built summary rather than surfacing broken output.
- Reinforces the `change.md` invariant: the deterministic engine stays authoritative; the LLM only rewords and must never alter a state or `units`.

### Sources

- `https://platform.claude.com/docs/en/build-with-claude/structured-outputs.md`
- OpenRouter Structured Outputs: `https://openrouter.ai/docs/guides/features/structured-outputs`
- OpenRouter provider-fallback trap: `https://github.com/simonw/llm-openrouter/issues/28`
- OpenRouter Response Healing: `https://openrouter.ai/blog/response-healing-reduce-json-defects-by-80percent`
