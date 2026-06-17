---
change_id: restocking-plan-decision-support
title: Restocking plan — from restatement to a prioritized, explained weekly decision
status: impl_reviewed
created: 2026-06-17
updated: 2026-06-17
archived_at: null
---

## Notes

Enhancement to the shipped `ai-weekly-restocking-plan` (S-04). Framed in
`context/changes/ai-weekly-restocking-plan/frame.md` (HIGH confidence).

The shipped AI panel only *restates* the engine's output, so it duplicates the
dashboard tiles and adds no decision support. This change widens the AI contract
from *restate* to *prioritize + explain*: the engine deterministically orders the
candidates by urgency and computes the facts; the AI adds a weekly headline and a
one-line "why" per product. Quantities, states, actions, selection, and order
stay engine-authoritative; the AI contributes prose only. The fallback path now
produces deterministic reasons so it still beats the tiles when the LLM is
unavailable.

Builds on the existing modules: `src/lib/restocking.ts`,
`src/lib/services/restocking-summary.ts`, `src/pages/api/restocking-plan/index.ts`,
`src/components/dashboard/RestockingPlan.tsx`.
