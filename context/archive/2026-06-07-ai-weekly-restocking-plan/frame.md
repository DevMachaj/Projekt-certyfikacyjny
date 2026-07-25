# Frame Brief: AI restocking plan — no value beyond the dashboard tiles

> Framing step before /10x-plan. This document captures what is _actually_
> at issue, separated from what was initially assumed.

## Reported Observation

The AI Weekly Restocking Plan panel produces effectively the same content the
dashboard already shows in the per-product tiles: a list of `product → "Order N
units" / "Monitor"` actions plus a one-sentence summary. Both the list and the
summary feel like a re-layout of the existing cards — no decision the owner
couldn't already make by scanning the dashboard.

## Initial Framing (preserved)

- **User's stated cause or approach**: the AI layer is redundant — restating the
  engine's output adds nothing.
- **User's proposed direction**: rethink the feature from scratch (chose /10x-frame
  over a prompt tweak).
- **Pre-dispatch narrowing**: redundancy is in **both** the items list _and_ the
  summary sentence (whole panel restates the dashboard); the missing decision
  support is **all three** of — what to do first (priority/urgency), _why_ (the
  runway / lead-time reasoning behind the numbers), and a single act-on-it
  artifact (totals / shopping list); scope of the rethink is **the AI layer
  specifically** (engine output is fine).

## Dimension Map

The observation could originate at any of these dimensions of the AI layer's
design chain:

1. **Payload — what the model receives** — if it lacked the facts to add value,
   it could only restate. ← _not_ the user's framing, worth ruling out
2. **Prompt — what the model is asked to do** — instruction shapes whether it
   synthesizes or restates. ← initial framing lands near here ("AI redundant")
3. **Output schema — what the model is allowed to return** — caps the _ceiling_
   of value regardless of prompt.
4. **Render — what the island displays** — even good synthesis shown next to a
   duplicate list reads as redundant.
5. **Feature boundary — whether the per-product list belongs here at all** —
   scoped out by the user (AI layer only); deferred.

## Hypothesis Investigation

| Hypothesis                          | Evidence                                                                                                                                                                                                                                                                | Verdict         |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| 1. Payload too thin                 | `RestockCandidate` carries `state, units, action, daysOfStock, velocity` (`src/lib/restocking.ts:10-16`); sent verbatim as `{candidates}` (`src/lib/services/restocking-summary.ts:107`). The runway facts needed for prioritization/reasoning are **already present**. | NONE            |
| 2. Prompt forbids synthesis         | `SYSTEM_PROMPT`: _"Restate the engine's plan… Do NOT invent products, change quantities, or recompute anything… Return only the weekly_summary field."_ (`restocking-summary.ts:25-30`). Explicitly instructs restatement, not decision-support.                        | STRONG          |
| 3. Output schema permits only prose | `SUMMARY_SCHEMA = { weekly_summary: string }`, `additionalProperties:false`, `required:[weekly_summary]` (`restocking-summary.ts:16-23`). The model **cannot** emit a priority order, per-item rationale, or structured action artifact even if asked.                  | STRONG          |
| 4. Render duplicates the tiles      | Island renders `weekly_summary` + `items.map(product → action)` (`RestockingPlan.tsx:91,93-99`); `ProductCard.astro` renders the same `recommendationText` action + name. The displayed list is the tile content, unordered.                                            | STRONG          |
| 5. Feature should not exist         | User scoped the rethink to the AI layer; engine output and the dashboard are wanted.                                                                                                                                                                                    | WEAK (deferred) |

## Narrowing Signals

- "Both parts restate the dashboard" → render (4) duplicates the tile list, not
  just the summary. Rules in the schema/render axis, not only the prompt.
- "All three decision gaps matter (priority, why, artifact)" → the wanted value
  is _synthesis_ (ordering + reasoning + a consolidated artifact), none of which
  the single-string schema can carry. Rules in (3) decisively.
- "Scope = AI layer, engine is fine" → rules out (5) and any change to
  `classify()` / quantities. The reframe must keep numbers engine-authoritative.

## Cross-System Convention

The "AI only restates, never recomputes" rule is **self-imposed**, from the cert
safety framing in `change.md` ("the AI only summarizes those existing
recommendations… a hallucinated LLM response can mislead the wording… but cannot
corrupt the underlying recommendation"). It is not a platform constraint.
Prioritizing, explaining, and consolidating are _synthesis over engine-computed
values_ — they do not invent or alter a quantity, state, or selection — so the
value ceiling can be raised **without** weakening the safety invariant. The
inverse test confirms it: a genuinely additive AI would need a schema richer than
one string; the current schema is exactly one string.

## Reframed Problem Statement

> **The actual problem to plan around is**: the AI layer was contracted to
> _restate_ the engine's output (restate-only prompt + single-prose-string schema
>
> - a render that re-lists the tiles), so it can never do the one job the
>   unordered tiles can't — turn the engine's facts into a _prioritized, explained,
>   act-on-it weekly decision_. The data to do this is already in the payload; the
>   three coupled constraints (prompt, schema, render) are what cap it at
>   "rewording the cards."

Addressing this means letting the AI synthesize a _decision_ — order the items by
urgency (runway vs lead time), give a one-line rationale per item, and surface a
consolidated take-action view (e.g. totals / what to order now vs watch) — while
quantities, states, and the product selection stay engine-built. That is the
value the dashboard tiles structurally cannot provide, and it stays inside the
"AI summarizes, never corrupts" guarantee.

## Confidence

**HIGH** — strong file:line evidence at three coupled loci (prompt 25-30, schema
16-23, render 91-99), the payload already carries the needed facts (ruling out the
"thin data" alternative), and the narrowing signals were decisive and mutually
consistent. The reframe survives the inverse test and reconciles with the
self-imposed safety convention.

## What Changes for /10x-plan

The plan is **not** "swap the LLM provider" or "tweak wording." It is: widen the
AI contract from _restate_ to _prioritize + explain + consolidate_ — a richer
output schema (ordered items with per-item rationale + a headline/action view), a
prompt that asks for a weekly _decision_ grounded in the supplied engine facts,
and a render that shows the prioritized reasoning rather than re-listing the
tiles — all while keeping quantities/states/selection engine-authoritative and
the fallback path intact.

## References

- Source files: `src/lib/services/restocking-summary.ts:16-30,107`,
  `src/lib/restocking.ts:10-16`, `src/components/dashboard/RestockingPlan.tsx:91-99`,
  `src/components/dashboard/ProductCard.astro:12,24`
- Change identity / safety framing: `context/changes/ai-weekly-restocking-plan/change.md`
- Prior research: `context/changes/ai-weekly-restocking-plan/research.md`
- Investigation: evidence gathered by direct read (surface small + already familiar; no sub-agents per no-padding guardrail)
