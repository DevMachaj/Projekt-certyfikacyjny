# AI Weekly Restocking Plan (S-04) — Plan Brief

> Full plan: `context/changes/ai-weekly-restocking-plan/plan.md`
> Research: `context/changes/ai-weekly-restocking-plan/research.md`

## What & Why

The owner clicks a button on `/dashboard` and gets one AI-generated weekly restocking summary, built strictly from the products the deterministic engine already classified `Understocked` or `Watch`. The engine makes every business decision (which products, the reorder quantity); the LLM only rewords its existing output into a readable plan — so a bad or unavailable AI response can never corrupt a state or a number. This is the project's first AI feature (roadmap slice S-04).

## Starting Point

Classification is already pure and exported (`classify()` → `ClassificationResult` with a `recommendation` union where only `Understocked` carries `units`). The only non-extracted logic is a 13-line glue block in `dashboard.astro:21-37`. Secrets are read via `astro:env/server` and encapsulated in `src/lib` (the `supabase.ts` null-guard pattern), routes follow a fixed 401/503/500 skeleton, and React islands `client:load` and own their `/api` fetches. `vitest` is wired (`npm test`).

## Desired End State

A "Generate weekly restocking plan" button on the dashboard calls `POST /api/restocking-plan`, which returns `{ weekly_summary, items: [{product, action}], source }`. The island renders the summary + per-product actions. `source` is `"ai"` (Anthropic reworded the plan), `"fallback"` (LLM failed → engine-built plan shown with an "AI summary unavailable" note), or `"empty"` (nothing to reorder — no LLM call).

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Provider | Anthropic Messages API direct (not OpenRouter) | Reliable `json_schema` constrained decoding, no beta header; OpenRouter schema adherence varies per provider | Research |
| Model | `claude-haiku-4-5` | Cheapest Claude with structured-output support; <1¢/call | Research |
| Secret handling | `ANTHROPIC_API_KEY` via `astro:env/server`, null-guard → 503 | Mirrors the Supabase pattern; `optional:true` so build/CI don't break | Research/Plan |
| Watch products | "Monitor", no quantity | Engine gives Watch `{kind:"none"}` — no units to restate; LLM must not invent one | Research/Plan |
| Selection | Pure `selectRestockCandidates`, runs before any LLM call, unit-tested | Keeps the engine authoritative and the boundary testable | Plan |
| LLM failure | Deterministic engine-built fallback, labeled | Degrade gracefully; never surface broken output | Plan |
| Empty case | Short-circuit, no LLM call | Saves tokens, no hallucination risk | Plan |
| Trigger/UI | React island on `/dashboard` | Same surface that lists these products; matches island-calls-`/api` pattern | Plan |

## Scope

**In scope:** extract shared `classifyUserCatalog`; pure selection + deterministic plan with unit tests; Anthropic service in `src/lib/services` with timeout + `stop_reason` guard + fallback; `POST /api/restocking-plan`; dashboard island with labeled fallback/empty states; `ANTHROPIC_API_KEY` wiring.

**Out of scope:** any DB schema/migration; plan persistence or LLM-response caching; streaming; rate-limiting beyond disable-while-pending; changes to `classify()` or the dashboard's existing grouped view; model-selection UI.

## Architecture / Approach

Inward-out along existing seams: **Phase 1** extracts the classification glue to a pure helper shared by the dashboard and the endpoint. **Phase 2** adds pure, LLM-free selection that fixes each action deterministically (`Order N units` / `Monitor`) plus a deterministic plan builder — the single source of truth for both the LLM's input facts and the failure fallback. **Phase 3** wraps the Anthropic call in `src/lib/services`, degrading to that deterministic plan on any failure. **Phase 4** exposes it through a conventional route that short-circuits the empty case. **Phase 5** surfaces it via a dashboard island.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Extract `classifyUserCatalog` | Shared pure helper; dashboard repointed, zero behavior change | Accidental output drift on the dashboard |
| 2. Pure selection + deterministic plan | `selectRestockCandidates` + `buildDeterministicPlan` + unit tests | Watch leaking a quantity (guarded by test) |
| 3. Anthropic service + secret | `summarizeRestockPlan` with timeout/guard/fallback; env wired | First outbound fetch on workerd; response-shape guarding |
| 4. `POST /api/restocking-plan` | Orchestration route; empty short-circuit | Missing a 401/503/500 boundary case |
| 5. Dashboard island | Button + result panel; labeled fallback/empty | UX of failure/empty states |

**Prerequisites:** S-03 complete (classification engine + dashboard live, which it is); an Anthropic API key for live testing (`.dev.vars`).
**Estimated effort:** ~2–3 sessions across the 5 phases.

## Open Risks & Assumptions

- The LLM could disobey "restate, don't recompute"; mitigated by deterministic `items` being authoritative for display and the engine numbers never coming from the model.
- `json_schema` structured-output behavior on `claude-haiku-4-5` is assumed reliable per research; the `res.ok`+`stop_reason`+parse guard catches any deviation into the fallback.
- No automated route/island test harness exists; Phases 4–5 rely on manual verification.

## Success Criteria (Summary)

- Owner gets a readable weekly plan from real engine data; Understocked shows the engine's "Order N units", Watch shows "Monitor" with no invented quantity.
- With the key unset or the LLM failing, the owner still sees a correct engine-built plan (labeled), never a crash or broken output.
- An account with nothing to reorder sees a clear "Nothing to reorder this week" message and no LLM call is made.
