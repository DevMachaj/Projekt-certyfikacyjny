---
change_id: testing-velocity-engine-correctness
title: Velocity engine correctness — unit tests for Risk #2 (test-plan Phase 1)
status: implemented
created: 2026-06-23
updated: 2026-06-27
archived_at: null
---

## Notes

Rollout Phase 1 of `context/foundation/test-plan.md`: "Velocity engine correctness".

**Risk covered:** Risk #2 — velocity engine returns a plausible-but-wrong classification or reorder quantity for valid-but-edge inputs (boundary thresholds, zero/near-zero velocity, gap-day denominator); the owner acts on it and the mistake stays invisible.

**Test types planned:** unit (vitest infra already exists; `npm test` = `vitest run`).

**Risk response intent:**
- Prove that edge inputs map to the PRD §Business Logic threshold table's expected state and quantity.
- Challenge the assumption that the 4 existing unit tests in `src/lib/` already cover this.
- Avoid the oracle problem — expected values must come from the PRD thresholds table, not be lifted from the implementation under test.

This phase also wires the unit gate (`npm test`) into CI (currently lint + build only).
