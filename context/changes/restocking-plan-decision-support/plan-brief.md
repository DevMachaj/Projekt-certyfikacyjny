# Restocking Plan — Prioritized, Explained Weekly Decision — Plan Brief

> Full plan: `context/changes/restocking-plan-decision-support/plan.md`
> Frame brief: `context/changes/ai-weekly-restocking-plan/frame.md`

## What & Why

The shipped AI restocking panel only *restates* the engine's output, so it duplicates the dashboard tiles and adds no decision support. This change widens the AI contract from *restate* to *prioritize + explain*: the engine orders the candidates by urgency and computes the facts; the AI adds a weekly headline and a one-line "why" per product — the synthesis the unordered tiles structurally cannot give.

## Starting Point

`RestockCandidate` carries `state, units, action, daysOfStock, velocity` but not `leadTime`, and `selectRestockCandidates` orders Understocked-before-Watch by input order, not urgency. The service already sends the full facts to the model but the prompt says "restate, never recompute" and the schema permits only `{ weekly_summary: string }`. The island re-lists the tiles.

## Desired End State

The button returns `{ headline, items:[{product, action, reason, daysOfStock, leadTime, units, state}], source }`: items always engine-built and ordered most-urgent-first; headline + per-item reason AI-authored on the `"ai"` path and deterministic on fallback/empty. The island shows the headline, then a ranked list where each row pairs the AI "why" with a verifiable engine facts line (days of stock vs lead time).

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| What to fix | Widen AI contract (not provider/prompt tweak) | Prompt + 1-string schema + tile-duplicating render cap the value | Frame |
| AI output shape | Headline + one-line "why" per item | Closes priority/why/artifact gaps with minimal schema growth | Plan |
| Number safety | Show engine numbers next to AI prose | Readable reasoning + verifiable numbers; preserves the cert invariant | Plan |
| Ordering | Engine computes urgency, AI explains | Provably-correct order, zero ranking hallucination | Plan |
| Fallback | Deterministic reasons from facts | Fallback still beats the tiles when LLM is down | Plan |
| UI | Ranked list w/ "why" + inline facts | Priority + reasoning + verifiable numbers in one scan | Plan |

## Scope

**In scope:** urgency ordering + `leadTime` + deterministic reasons + headline in the engine; richer AI schema/prompt + validated parse + name-keyed merge in the service; route passthrough; island ranked-list render.

**Out of scope:** `classify()`/engine rules/states; dashboard tiles; DB/migrations; persistence/caching; streaming; provider/model change. The AI never decides order, emits an action/quantity, or selects products.

## Architecture / Approach

Engine-outward. Phase 1 makes the deterministic core authoritative for order, facts, reasons, and headline — so the fallback is already valuable. Phase 2 layers the AI on top: a richer schema/prompt, a pure `parsePlanResponse`, and a pure `mergeAiReasons` that maps AI reasons onto engine items **by exact product name** (unknown → dropped, missing → deterministic reason kept). Phase 3 renders it. The engine plan stays the single source of truth for everything structural; the AI contributes only the headline and reason prose.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Engine | Urgency order, `leadTime`, deterministic reasons, headline (pure + tested) | Urgency metric edge cases (nulls) |
| 2. Service + route | Richer schema/prompt, validated parse + name-keyed merge, passthrough | AI hallucinating products/numbers — mitigated by merge validation + engine-built items |
| 3. Island | Headline + ranked list with "why" + inline facts | Denser rows; keep fallback/empty/pending states |

**Prerequisites:** shipped `ai-weekly-restocking-plan` (done); `ANTHROPIC_API_KEY` in `.dev.vars` for the live Phase 2 check.
**Estimated effort:** ~2–3 sessions across 3 phases.

## Open Risks & Assumptions

- AI may name a product not in the engine set or state a wrong number in prose — mitigated by name-keyed merge (drops unknowns) and showing engine numbers inline; items/order/actions never come from the AI.
- Slightly larger response (per-item reasons); `max_tokens` ~1024 stays, `stop_reason` guard routes truncation to fallback.

## Success Criteria (Summary)

- The plan shows a prioritized, explained weekly decision the tiles don't provide — most-urgent first, with a "why" and verifiable numbers per item.
- With the key unset, the fallback still shows deterministic reasons (engine numbers intact); nothing-to-reorder shows the headline message.
- A hallucinated product never appears; a missing AI reason falls back to the deterministic one; quantities/states/order are always engine-built.
