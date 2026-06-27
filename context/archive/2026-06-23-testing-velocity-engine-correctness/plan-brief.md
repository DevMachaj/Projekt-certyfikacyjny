# Velocity Engine Correctness — Plan Brief

> Full plan: `context/changes/testing-velocity-engine-correctness/plan.md`
> Research: `context/changes/testing-velocity-engine-correctness/research.md`

## What & Why

Test-rollout Phase 1 (Risk #2): the velocity engine returning a
plausible-but-wrong classification or reorder quantity for valid-but-edge inputs,
which the owner acts on while the mistake stays invisible. Research produced the
oracle from the PRD and, in doing so, exposed two confirmed bugs. This change pins
the oracle with oracle-first unit tests, fixes the two bugs, verifies the suite
bites via mutation testing, and wires the unit gate into CI.

## Starting Point

The engine is one pure module (`src/lib/classification.ts`) with a 19-case suite
that already pins most boundaries well — but one of those tests (`:46-49`) is a
mirror test that actively *cements* the gap-day bug. CI runs lint + build only, so
no unit test is enforced today.

## Desired End State

`npm test` is green, encodes the PRD oracle (gap-day envelope, Understocked beats
slow-velocity, `velocity == 0.1` boundary, pinned `ceil`), and the engine code
matches it. Stryker shows no meaningful survivors on the module. A red unit test
now fails CI. The test-plan cookbook documents the oracle-first pattern.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Velocity denominator | Calendar envelope (gap days count) | PRD "calendar days covered"; envelope reflects true rate over the period | Research |
| Slow-mover vs Understocked | Understocked wins | An about-to-stock-out item must say "Order", not "Promote" — the action must not invert | Research |
| Reorder rounding | `ceil` (already correct) | Never under-order; aligns with PRD's stockout-cost framing | Research |
| Handle the two bugs | Fix in-phase (tests green) | The phase is "correctness"; fixes break only the one bug-mirroring test | Plan |
| Invalid-input hardening | Defer to Phase 2 | Reversed/NaN dates are validation-layer concerns, not engine math | Plan |
| Mutation testing | Stryker, ad-hoc on the module | Selective gate after a risk phase confirms boundary tests are load-bearing | Plan |
| CI unit gate | Required, blocking `npm test` | Matches test-plan §5 "required after Phase 1" | Plan |

## Scope

**In scope:** gap-day envelope fix + tests; classification-priority fix + tests;
`velocity == 0.1` boundary; strengthened `== 7` test; pinned `ceil`; replace the
one mirror test; ad-hoc Stryker pass; `npm test` in CI; §6.1 cookbook + rollout
sync.

**Out of scope:** engine input-validation guards; the `units_sold` DB/zod
constraint bug (Phase 2/3, integration); integration/e2e; redundant re-tests of
already-correct boundaries.

## Architecture / Approach

Test-first. Phase 1 fixes are nameable red→green TDD units; Phase 2 adds tests
that assert already-correct behavior (green on write); Phase 3 verifies via
mutation; Phase 4 wires CI + docs. Every expected value derives from the PRD
threshold table / resolved oracle, never from engine output.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Engine fixes (OG-1+OG-2) | Envelope + priority fixed, oracle tests green | Reordering the ladder must preserve zero-velocity → Slow-mover |
| 2. Boundary gaps | `velocity==0.1`, pinned `==7` state, `ceil`, de-mirrored label test | Adding redundant cases instead of gap-filling |
| 3. Mutation gate | Stryker confirms the suite bites | Chasing cosmetic/equivalent mutants |
| 4. CI + cookbook + sync | `npm test` blocks CI; pattern documented | Forgetting to verify red actually fails CI |

**Prerequisites:** none — research + oracle resolved; engine and suite exist.
**Estimated effort:** ~1–2 sessions across 4 phases (small module, small fixes).

## Open Risks & Assumptions

- OG-1 changes computed velocity for products with gapped entries (correctness
  change, matches PRD; no data migration — classification is computed on read).
- Stryker may not yet be a dev-dependency; adding it must not wire it into CI.
- The pure engine remains non-robust to invalid input by design — relies on Phase 2
  validation. If Phase 2 slips, unvalidated callers could feed garbage.

## Success Criteria (Summary)

- Edge inputs map to the PRD threshold table's expected state and quantity, asserted
  with oracle-derived literals.
- The two confirmed bugs are fixed; the suite is green and mutation-verified.
- A red unit test fails CI; the cookbook records the oracle-first pattern.
