# Velocity Engine Correctness — Implementation Plan

## Overview

Phase 1 of the test rollout (`context/foundation/test-plan.md` §3), covering Risk
#2: the velocity engine returning a plausible-but-wrong classification or reorder
quantity for valid-but-edge inputs. Research resolved the oracle from the PRD and,
in doing so, exposed two confirmed bugs (OG-1 gap-day denominator, OG-2
Slow-mover-vs-Understocked priority). This plan pins the oracle with oracle-first
unit tests, **fixes those two bugs in-phase** so the engine is actually correct,
verifies the suite is load-bearing via a selective Stryker pass, and wires the
unit gate into CI.

## Current State Analysis

- The engine is one pure, dependency-free module: `src/lib/classification.ts`
  (`classify`, `velocityOf`, `totalHistoryDays`, `entryDays`,
  `recommendationText`, `THRESHOLD_DEFINITIONS`). Inputs are `Product` +
  `SalesEntry[]`; output is a `ClassificationResult`. No DB/network → unit layer
  is the correct and cheapest signal.
- Existing suite `src/lib/classification.test.ts` (19 cases) already pins most
  boundaries with spec-derived literals — `dos == lead` (→Watch), `dos == 2×lead`
  (→OK), `dos == 90` (→Slow), velocity null/0, `ceil` via a fractional case, the
  null-lead path. It is stronger than the test-plan assumed.
- **Two confirmed bugs** (oracle resolved by the PRD owner 2026-06-23, see
  `research.md` §Resolved Oracle):
  - **OG-1:** `totalHistoryDays` (`classification.ts:98`) sums each entry's
    inclusive span and ignores gap days. The oracle is the **calendar envelope**
    `max(end) − min(start) + 1`. This denominator also feeds the 7-day
    Insufficient-data gate (`:126`).
  - **OG-2:** the `velocity < 0.1` Slow-mover gate (`:137`) runs *before* the
    Understocked check (`:156`), so a barely-selling item that is also about to
    stock out is told "Consider promotion" instead of "Order X units" — the
    user-facing action inverts. Oracle: **Understocked wins**.
- **OG-3** (`Math.ceil`, `:157`) already matches the oracle — pin it, don't change it.
- `.github/workflows/ci.yml` runs lint + build only — **no test step**. Tests can
  be red while CI is green.

### Key Discoveries:

- `classification.test.ts:46-49` is itself a **mirror test that cements OG-1**:
  it asserts `totalHistoryDays([Jan1–5, Feb1–4]) === 5 + 4`. Under the envelope
  oracle that value is 35 (Jan 1 → Feb 4). This test must be updated, not kept.
- Fix blast radius is small and was traced against every existing case:
  - OG-1 (envelope) breaks **only** `:46-49`. Every other test uses single or
    *adjacent* entries (e.g. `:123-131` Jan1–5 + Jan6–20) where envelope == summed
    span, so they stay green.
  - OG-2 (Understocked-wins) breaks **zero** existing tests — none of the current
    Slow-mover cases hit the collision: `:84` (dos 20 > lead 5), `:101` (dos 40 >
    lead 5), `:200` (lead null) all have ample days-of-stock or no lead time.
- Zero-velocity stays Slow-mover under both fixes: `velocity == 0` →
  `daysOfStock == null` (infinite), so `daysOfStock < leadTime` is false → not
  Understocked → Slow-mover. The OG-2 reorder must preserve this.
- `velocity == 0.1` exact boundary is the one listed edge case with **no**
  coverage; the rule is `< 0.1`, so `0.1` must classify as *not* Slow-mover.
- `MIN_HISTORY_DAYS = 7`, `SLOW_VELOCITY = 0.1`, `SLOW_DAYS_OF_STOCK = 90`
  (`classification.ts:20-24`). Oracle source: `prd.md:148-188` (§Business Logic).

## Desired End State

`npm test` is green and now encodes the PRD oracle, including the gap-day envelope,
the Understocked-over-slow-velocity priority, the `velocity == 0.1` boundary, and a
pinned `ceil`. The engine code matches that oracle. A Stryker pass over
`classification.ts` shows no *meaningful* survived mutants. CI fails on a red unit
test. The test-plan §6.1 cookbook documents the oracle-first unit pattern and §3
Phase 1 is `complete`.

Verify: `npm test` green; `npm run lint` and `npm run build` green; a CI run on a
PR shows the unit step and fails if a test is deliberately broken; the Stryker HTML
report has only consciously-ignored survivors.

## What We're NOT Doing

- **Not hardening the pure engine against invalid input** (reversed date spans,
  NaN dates). Risk #2 is about *valid-but-edge* inputs; malformed input is
  rejected at the zod/DB validation boundary, which **Phase 2** owns
  (`src/lib/validation/sales-entry.ts`). No engine guards, no bad-input tests here.
- **Not touching the `units_sold` three-way constraint mismatch** (DB `CHECK (> 0)`
  vs zod `nonnegative()` vs engine comments). It is an integration-layer bug for
  Phase 2/3 — a hermetic stub would lie about the DB CHECK. Logged in `research.md`.
- **Not adding integration/e2e tests** — out of layer for this risk (test-plan §4).
- **Not re-testing already-correct, already-covered boundaries** redundantly — we
  fill gaps and pin the oracle, we don't duplicate green cases (anti-pattern §
  "Redundant copies").
- **Not making Stryker a per-commit CI gate** — it is an ad-hoc selective gate
  (CLAUDE.md §Mutation testing).

## Implementation Approach

Test-first throughout. Phases 1 (the two fixes) are natural `/10x-tdd` units: the
first failing assertion is nameable in one sentence. Phase 2 adds tests that assert
already-correct behavior (green on write) to close coverage gaps. Phase 3 is a
verification pass that may add assertions. Phase 4 is wiring + docs.

Each new/changed expected value is derived from the PRD threshold table or the
resolved oracle in `research.md` — never recomputed with the engine's own logic
(the mirror anti-pattern that produced `:46-49`).

## Critical Implementation Details

- **OG-2 ordering is subtle.** The Understocked check requires lead set *and* a
  finite `daysOfStock`. It must fire before the `velocity < 0.1` gate, but the
  `daysOfStock >= 90` Slow rule and the pure-low-velocity-with-ample-stock case
  must still resolve to Slow-mover. Concretely: compute `velocity` and a guarded
  `daysOfStock` first; if `leadTime != null && daysOfStock != null && daysOfStock <
  leadTime` → Understocked (Order); only then apply `velocity < 0.1` → Slow-mover,
  `daysOfStock >= 90` → Slow-mover, null-lead → OK+set-lead-time, then the
  Watch/OK bands. Zero-velocity (`daysOfStock == null`) skips Understocked and lands
  Slow-mover unchanged.
- **OG-1 changes a shared denominator.** `totalHistoryDays` feeds both `velocityOf`
  and the 7-day gate in `classify`, so the envelope change shifts gate behavior too
  (two 4-day entries 30 days apart = 38-day envelope → passes the gate). `entryDays`
  (single-entry inclusive span) stays as-is and is still correct for a single entry.

## Phase 1: Engine correctness fixes (OG-1 + OG-2)

### Overview

Pin the two divergent behaviors with red oracle tests, then fix the engine to
green. Update the one existing test that cements OG-1.

### Changes Required:

#### 1. Gap-day envelope tests (OG-1)

**File**: `src/lib/classification.test.ts`

**Intent**: Add failing tests proving velocity divides by the calendar envelope,
counting dead gap days. Use the research example so the expected value is
oracle-derived, not implementation-derived.

**Contract**: New cases in the `day-count helpers` / a new `gap-day denominator`
describe block. Two entries Jan 1–5 (10u) + Jan 20–24 (10u): `totalHistoryDays`
must be `35` (Jan 1 → Jan 24 inclusive is 24 — use the exact envelope:
`max(end) − min(start) + 1`), `velocityOf` ≈ `20 / 24 ≈ 0.833`. Pick literal dates
whose envelope is unambiguous and assert the envelope day-count and the resulting
velocity as literals derived from the PRD reading, not from `entryDays` sums. Also
add a 7-day-gate-across-a-gap case (two short entries spanning ≥7 calendar days →
classified, not Insufficient).

#### 2. Update the OG-1 bug-mirroring test

**File**: `src/lib/classification.test.ts:46-49`

**Intent**: The existing `sums totalHistoryDays across multiple non-overlapping
entries` test asserts summed spans (`5 + 4`) — the bug. Rewrite it to the envelope
expectation with a literal, and rename the case to reflect "calendar envelope incl.
gap days."

**Contract**: For entries Jan 1–5 + Feb 1–4, expected `totalHistoryDays` = envelope
`Jan 1 → Feb 4` = `35` (literal, not `5 + 4`).

#### 3. Collision-case test (OG-2)

**File**: `src/lib/classification.test.ts`

**Intent**: Add a failing test for a product that is both low-velocity (< 0.1) and
about to stock out (`daysOfStock < leadTime`), asserting **Understocked + Order**,
not Slow-mover + promote.

**Contract**: e.g. velocity ≈ 0.05, `leadTime` large enough that `daysOfStock <
leadTime` (stock and dates chosen so `daysOfStock` is finite and below lead). Assert
`state === "Understocked"` and `recommendation.kind === "order"` with a units value
computed from the PRD formula `ceil(velocity × (lead + buffer))` stated as a literal.
Add a guard case: zero-velocity (0 units over ≥7 days) with low stock stays
**Slow-mover** (daysOfStock null → not Understocked).

#### 4. Fix `totalHistoryDays` → calendar envelope (OG-1)

**File**: `src/lib/classification.ts:97-100`

**Intent**: Replace the summed-span reduce with the calendar envelope so gap days
count toward the denominator. Empty entries → 0; single entry → its inclusive span.

**Contract**: `totalHistoryDays(entries)` = `0` when empty, else
`(max(parseUTC(end)) − min(parseUTC(start))) / MS_PER_DAY + 1`. Update the
doc-comment (`:97` and the file header `:12`) to say "calendar envelope incl. gap
days," not "sum of each entry's inclusive span."

#### 5. Fix classification priority (OG-2)

**File**: `src/lib/classification.ts:132-163`

**Intent**: Reorder the ladder so Understocked (imminent stockout) beats the
`velocity < 0.1` Slow-mover gate, while preserving zero-velocity → Slow-mover,
`daysOfStock >= 90` → Slow-mover, and null-lead → OK+set-lead-time.

**Contract**: Compute `velocity` and a guarded `daysOfStock` (`velocity > 0 ?
stock/velocity : null`) up front. New order after the Insufficient gate:
`if (leadTime != null && daysOfStock != null && daysOfStock < leadTime)` →
Understocked (Order, `ceil(velocity × (leadTime + buffer))`); then
`velocity < SLOW_VELOCITY` → Slow-mover; then `daysOfStock >= SLOW_DAYS_OF_STOCK`
→ Slow-mover; then `leadTime == null` → OK+set-lead-time; then `daysOfStock <
2*leadTime` → Watch; else OK. Update the file-header "Evaluation order" comment
(`:13-14`) to match.

### Success Criteria:

#### Automated Verification:

- All new OG-1/OG-2 tests pass: `npm test`
- Full unit suite green (no regressions in the other 3 test files): `npm test`
- Type checking passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification:

- The updated `:46-49` test asserts a literal envelope value (35), not a recomputed `5 + 4`.
- Spot-check one collision case by hand against the PRD: low-velocity + below-lead-time → Order, with units = `ceil(velocity × (lead + buffer))`.

**Implementation Note**: After automated verification passes, pause for human
confirmation before Phase 2.

---

## Phase 2: Boundary coverage gaps (no engine change)

### Overview

Close the remaining coverage gaps the oracle exposed. These assert
already-correct behavior, so they go green on write and protect against future
mutation.

### Changes Required:

#### 1. `velocity == 0.1` exact boundary

**File**: `src/lib/classification.test.ts`

**Intent**: Pin that exactly `0.1` units/day is **not** Slow-mover (rule is `<
0.1`), killing a `<`→`<=` mutant at `classification.ts:137`.

**Contract**: Inputs giving velocity exactly `0.1` (e.g. 1 unit over 10 days) with
stock/lead chosen so the resulting state is a non-Slow band; assert `state !==
"Slow-mover"` and the specific expected band.

#### 2. Strengthen the `== 7`-day test

**File**: `src/lib/classification.test.ts:66-71`

**Intent**: The case currently only asserts `not "Insufficient data"`. Pin the
*resulting* state and recommendation so a regression routing 7-day history into the
wrong state fails.

**Contract**: Keep the exactly-7-days input; add assertions for the exact expected
`state` (derived from the chosen stock/lead via the PRD table) and recommendation.

#### 3. Pin OG-3 `ceil` with a fractional literal

**File**: `src/lib/classification.test.ts`

**Intent**: Ensure a `ceil`→`floor`/`round` mutant dies. The existing `:145` case
(10/7 → 15) already does this; add one explicit `8.5 → 9` case from the research
example for clarity if not already covered, else note coverage is sufficient.

**Contract**: velocity × (lead + buffer) = a `.5` value (e.g. 0.5 × 17 = 8.5) →
`units === 9` (literal).

#### 4. Replace the one mirror test

**File**: `src/lib/classification.test.ts:211-217`

**Intent**: `thresholdLabel == THRESHOLD_DEFINITIONS[result.state]` recomputes via
the same lookup the impl uses — near-zero signal. Assert the literal definition
string instead.

**Contract**: For an Understocked result, assert `thresholdLabel === "Fewer than
lead-time days of stock remaining at current velocity."` (literal from the PRD/FR-006
transparency text). Keep the "all five states have a definition" test.

### Success Criteria:

#### Automated Verification:

- New boundary tests pass: `npm test`
- Full suite green: `npm test`
- Lint + build pass: `npm run lint && npm run build`

#### Manual Verification:

- No redundant near-duplicate cases were added (review the diff against the "redundant copies" anti-pattern).
- Every new expected value traces to the PRD table / resolved oracle, not to engine output.

**Implementation Note**: Pause for human confirmation before Phase 3.

---

## Phase 3: Mutation gate (Stryker, ad-hoc)

### Overview

Confirm the suite is load-bearing by running Stryker selectively over the engine
module. Add assertions to kill *meaningful* survivors; consciously ignore
equivalents.

### Changes Required:

#### 1. Run Stryker scoped to the engine

**File**: (no source change unless survivors found) — command + report review

**Intent**: Verify boundary operators (`<` vs `<=`, `>=`), the envelope formula
(`+1`, min/max), and `ceil` are all pinned.

**Contract**: `npx stryker run --mutate "src/lib/classification.ts"`. If Stryker is
not yet a dev-dependency, add it and a minimal `stryker.conf` (vitest runner)
**without** wiring it into CI. Open the HTML report.

#### 2. Kill meaningful survivors

**File**: `src/lib/classification.test.ts`

**Intent**: For each survived mutant, ask "would this change hurt a user or the
business?" If yes, add a literal-derived assertion that kills it. If no (equivalent
/ cosmetic), record the decision and move on — do not chase 100%.

**Contract**: New assertions, if any, follow the oracle-first rule. A short note of
which survivors were consciously ignored and why goes into the cookbook entry
(Phase 4).

### Success Criteria:

#### Automated Verification:

- Stryker runs to completion on `src/lib/classification.ts`: `npx stryker run --mutate "src/lib/classification.ts"`
- Full suite still green after any added assertions: `npm test`

#### Manual Verification:

- The HTML report's remaining survivors are all consciously-ignored equivalents, each with a recorded reason.
- No assertion was added purely to pin a cosmetic/implementation detail (no new mirror tests).

**Implementation Note**: Pause for human confirmation before Phase 4.

---

## Phase 4: CI gate + cookbook + sync

### Overview

Enforce the unit gate in CI and record the pattern and rollout state.

### Changes Required:

#### 1. Add the unit step to CI

**File**: `.github/workflows/ci.yml`

**Intent**: Add a required, blocking `npm test` step so a red unit test fails the
build. Place it after `npm run lint` (and before or after `build` — it must gate the
PR either way).

**Contract**: A `- run: npm test` step in the existing `ci` job, using the same
`SUPABASE_URL` / `SUPABASE_KEY` env already provided to the build step if the test
process needs them (the engine tests are pure; the `astro:env/server` stub is
aliased in `vitest.config.ts`, so secrets are not required — do not add them unless
a test fails without them).

#### 2. Fill the §6.1 cookbook entry

**File**: `context/foundation/test-plan.md` §6.1

**Intent**: Replace the "TBD" with the concrete oracle-first unit pattern this
phase established.

**Contract**: Document: assert PRD-threshold-table outputs as literals (never
recompute with engine logic); the gap-day envelope and `velocity == 0.1` boundary as
worked examples; the Stryker selective-gate command and the "would it hurt a user"
survivor rule; reference `src/lib/classification.test.ts` as the canonical example.

#### 3. Sync rollout + gate state

**File**: `context/foundation/test-plan.md` (§3, §5), `context/changes/testing-velocity-engine-correctness/change.md`

**Intent**: Reflect that Phase 1 shipped.

**Contract**: §3 Phase 1 Status → `complete`; §5 `unit` gate row → required
(wired); `change.md` status advanced by the implementer per the progress contract.

### Success Criteria:

#### Automated Verification:

- CI config is valid YAML and the test step is present: a PR run shows the `npm test` step executing.
- A deliberately-broken test fails CI (verify once on a throwaway branch/commit, then revert).
- `npm test`, `npm run lint`, `npm run build` all green locally.

#### Manual Verification:

- test-plan §6.1 reads as a usable recipe, not a restatement of the rule.
- test-plan §3 Phase 1 shows `complete` and §5 shows the unit gate as required/wired.

**Implementation Note**: Final phase — confirm the CI gate actually blocks on red before closing.

---

## Testing Strategy

### Unit Tests:

- Gap-day envelope: two gapped entries → envelope day-count + velocity (OG-1).
- 7-day gate across a gap: short entries spanning ≥7 calendar days → classified.
- Collision: low-velocity + below-lead-time → Understocked + Order (OG-2).
- Zero-velocity + low stock → Slow-mover (OG-2 guard).
- `velocity == 0.1` → not Slow-mover (boundary).
- `== 7` days → pinned resulting state.
- `ceil` via a fractional `.5` case → integer round-up.
- Literal threshold-definition string (replaces the mirror test).

### Integration Tests:

- None in this phase — Risk #2 is unit-layer (test-plan §4). The `units_sold`
  constraint bug and input validation are deferred to Phase 2 integration.

### Manual Testing Steps:

1. Run `npm test`; confirm green and that the new cases are present.
2. Run Stryker on `classification.ts`; open the report; confirm only conscious equivalents survive.
3. Open a PR; confirm the CI `npm test` step runs; break a test on a throwaway commit and confirm CI goes red; revert.

## Performance Considerations

None. The engine is O(n) over a product's entries; the envelope is a single
min/max pass. Test suite is fast (`vitest run`, node env).

## Migration Notes

The OG-1 fix changes computed velocity/classification for any product with gapped
sales entries (gap days now lower velocity). This is a *correctness* change matching
the PRD; existing stored data is unaffected (classification is computed on read).
No data migration needed.

## References

- Research (oracle + resolved gaps): `context/changes/testing-velocity-engine-correctness/research.md`
- Oracle source: `context/foundation/prd.md:148-188` (§Business Logic)
- Engine: `src/lib/classification.ts`; existing suite: `src/lib/classification.test.ts`
- Test strategy: `context/foundation/test-plan.md` §2 Risk #2, §3 Phase 1, §4, §5, §6.1
- CI: `.github/workflows/ci.yml`; test config: `vitest.config.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Engine correctness fixes (OG-1 + OG-2)

#### Automated

- [x] 1.1 All new OG-1/OG-2 tests pass (`npm test`)
- [x] 1.2 Full unit suite green, no regressions in the other 3 files (`npm test`)
- [x] 1.3 Type checking passes (`npm run lint`)
- [x] 1.4 Build passes (`npm run build`)

#### Manual

- [x] 1.5 Updated `:46-49` test asserts a literal envelope value (35), not `5 + 4`
- [x] 1.6 Hand-checked one collision case against the PRD (low-velocity + below-lead → Order)

### Phase 2: Boundary coverage gaps (no engine change)

#### Automated

- [ ] 2.1 New boundary tests pass (`npm test`)
- [ ] 2.2 Full suite green (`npm test`)
- [ ] 2.3 Lint + build pass (`npm run lint && npm run build`)

#### Manual

- [ ] 2.4 No redundant near-duplicate cases added (diff reviewed vs "redundant copies")
- [ ] 2.5 Every new expected value traces to the PRD/oracle, not engine output

### Phase 3: Mutation gate (Stryker, ad-hoc)

#### Automated

- [ ] 3.1 Stryker runs to completion on `src/lib/classification.ts`
- [ ] 3.2 Full suite green after any added assertions (`npm test`)

#### Manual

- [ ] 3.3 Remaining survivors are conscious equivalents, each with a recorded reason
- [ ] 3.4 No assertion added purely to pin a cosmetic/implementation detail

### Phase 4: CI gate + cookbook + sync

#### Automated

- [ ] 4.1 PR run shows the `npm test` step executing
- [ ] 4.2 A deliberately-broken test fails CI (verified then reverted)
- [ ] 4.3 `npm test`, `npm run lint`, `npm run build` green locally

#### Manual

- [ ] 4.4 test-plan §6.1 reads as a usable recipe
- [ ] 4.5 test-plan §3 Phase 1 = `complete`, §5 unit gate = required/wired
