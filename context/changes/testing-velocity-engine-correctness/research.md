---
date: 2026-06-23T00:00:00Z
researcher: Claude (10x-research)
git_commit: 29876d92c377d2b763b49bbf67fa4a181989bd04
branch: main
repository: DevMachaj/Projekt-certyfikacyjny
topic: "Velocity engine correctness — oracle for Risk #2 unit tests (test-plan Phase 1)"
tags: [research, codebase, classification, velocity-engine, oracle, risk-2]
status: complete
last_updated: 2026-06-23
last_updated_by: Claude (10x-research)
last_updated_note: "Oracle gaps OG-1/2/3 resolved by PRD owner; OG-1 and OG-2 reveal the implementation diverges from the oracle (confirmed bugs)."
---

# Research: Velocity engine correctness — oracle for Risk #2 unit tests

**Date**: 2026-06-23T00:00:00Z
**Researcher**: Claude (10x-research)
**Git Commit**: 29876d92c377d2b763b49bbf67fa4a181989bd04
**Branch**: main
**Repository**: DevMachaj/Projekt-certyfikacyjny

## Research Question

Produce the **oracle** for test-plan Phase 1 (Risk #2): what *should* the velocity
engine compute for valid-but-edge inputs (boundary thresholds, zero / near-zero
velocity, gap-day denominator), so we can write unit tests that catch a
plausible-but-wrong classification or reorder quantity — without lifting expected
values from the implementation. Also: is the existing test base actually covering
this risk, and where is the CI gate?

## Summary

The engine lives in a single, well-structured module
(`src/lib/classification.ts`) and the existing unit suite is **far stronger than
the test-plan assumed** — most boundaries the plan worried about are already
pinned with spec-derived literals (not mirror tests). That reframes Phase 1: the
value is **not** "write the missing happy-path coverage." The value is three
things:

1. **Three oracle gaps — now RESOLVED by the PRD owner (2026-06-23), and two
   reveal the implementation is wrong.** Three behaviours the code's comments call
   "locked decisions" are locked in `plan.md`, **not the PRD**. They were taken to
   the PRD owner; the resolutions are recorded below in *Resolved Oracle*. Result:
   - **OG-1 Gap-day denominator → CALENDAR ENVELOPE.** Velocity divides by
     `max-end − min-start + 1` (gap days count). **Current code sums spans →
     confirmed BUG.**
   - **OG-2 `velocity < 0.1` vs `Understocked` priority → UNDERSTOCKED WINS.** Low
     stock about to run out must emit "Order X units", not "Consider promotion".
     **Current code returns Slow-mover first → confirmed BUG** (the user-facing
     action inverts). Highest-impact.
   - **OG-3 Reorder rounding → CEIL.** Matches current code; pin it (8.5 → 9). ✓

2. **Close the handful of real coverage gaps** — chiefly the `velocity == 0.1`
   exact boundary (a `<`→`<=` mutant at `classification.ts:137` survives the
   current suite), plus the `== 7`-day test only asserting *not*-Insufficient
   rather than pinning the resulting state, and unguarded malformed / reversed
   date spans.

3. **Wire the unit gate into CI.** `.github/workflows/ci.yml` runs lint + build
   only — **no test step**. Every test in the repo can be red while CI stays
   green. This is the phase's stated second deliverable and the single
   highest-leverage fix.

One **likely outright bug** surfaced outside the unit scope and should be logged
for Phase 2/3 (it is integration-layer, not unit): a three-way `units_sold`
constraint mismatch (DB `CHECK (> 0)` vs zod `nonnegative()` vs the engine's
"zero-sales periods lower velocity" design) that **breaks the zero-velocity
Slow-mover path at insert time**.

## Detailed Findings

### The engine (oracle vs implementation)

All computation is in `src/lib/classification.ts`. Constants:
`MIN_HISTORY_DAYS = 7` (`:20`), `SLOW_VELOCITY = 0.1` (`:22`),
`SLOW_DAYS_OF_STOCK = 90` (`:24`).

**Day count** ([classification.ts:92-100](https://github.com/DevMachaj/Projekt-certyfikacyjny/blob/29876d92c377d2b763b49bbf67fa4a181989bd04/src/lib/classification.ts#L92-L100)):
```ts
entryDays(entry) = (parseUTC(end) - parseUTC(start)) / MS_PER_DAY + 1   // inclusive
totalHistoryDays(entries) = Σ entryDays(entry)                          // simple sum
```
- Inclusive `+1` (D→D = 1 day) — **correct** against the natural reading of "days
  covered"; pin it (a mutant dropping `+1` shrinks every denominator).
- Multi-entry = **sum of spans, gap days excluded**. → **OG-1, see Open Questions.**

**Velocity** (`:103-108`, `:132`): `units / days`, guarded `if (days <= 0) return null`.
- velocity = 0 when ≥7 days of history but zero units → lands in Slow-mover (0 < 0.1),
  `daysOfStock = null` (∞ guarded). **Correct & PRD-consistent.**

**days_of_stock** (`:138`, `:143`): `stock / velocity`, guarded `velocity > 0 ? … : null`.

**reorder_quantity** (`:157`): `Math.ceil(velocity * (leadTime + buffer_days))`. → **OG-3.**

**Classification order** (sequential, first match wins — [classification.ts:126-163](https://github.com/DevMachaj/Projekt-certyfikacyjny/blob/29876d92c377d2b763b49bbf67fa4a181989bd04/src/lib/classification.ts#L126-L163)):
1. `totalDays < 7` → **Insufficient data** (`:126`) — strict `<`, days-of-history (not entry count), same day-count as the velocity denominator. **Correct.**
2. `velocity < 0.1` → **Slow-mover** + promote (`:137`) — **runs before Understocked.** → **OG-2.**
3. `daysOfStock >= 90` → **Slow-mover** + promote (`:144`).
4. `leadTime == null` → **OK** + "Set lead time…" (`:151`) — loose `==` catches null/undefined; `0` is blocked upstream by DB `CHECK (> 0)` and zod `.positive()`, so the 0-lead anomaly is structurally impossible.
5. `daysOfStock < leadTime` → **Understocked** + order (`:156`).
6. `daysOfStock < 2*leadTime` → **Watch** (`:160`).
7. else → **OK** (`:163`).

**Boundary operators verified correct against the PRD table.** The PRD's OK upper
bound (`< 90`) is enforced by the earlier `>= 90` Slow gate (`:144`), not in the OK
branch — so `daysOfStock == 90` resolves to Slow-mover. High-value exact-boundary
cases: `dos == leadTime`, `dos == 2*leadTime`, `dos == 90`, and `velocity == 0.1`.

### Existing test coverage (challenging "the 4 tests already cover this")

Four test files, ~54 cases. The velocity engine itself is covered by
`src/lib/classification.test.ts` (19 cases). The other three
(`restocking.test.ts`, `dashboard.test.ts`, `services/restocking-summary.test.ts`)
operate on hand-built `ClassificationResult` fixtures and **do not exercise the
velocity formulas** — they belong to other risks.

**Already covered (spec-derived literals, not mirrors):** Insufficient gate incl.
`==7` boundary; velocity null on empty / `0` on zero-sales; days_of_stock null when
∞; reorder `Math.ceil` via a fractional-velocity case (10/7 → 15); the
`dos == leadTime` (→Watch), `dos == 2*leadTime` (→OK), `dos == 90` (→Slow-mover)
boundaries; Slow-mover precedence over the day-bands; null-lead-time path.

**Genuine gaps (the part "already covered" overstates):**
| Gap | Evidence | Why it matters |
|---|---|---|
| `velocity == 0.1` exact boundary **untested** | only `0.05` and "≥0.1 generally" tested | a `<`→`<=` mutation at `classification.ts:137` survives the suite |
| `==7`-day test asserts only *not* "Insufficient data" | `classification.test.ts:66` | a regression routing 7-day history into the *wrong* state passes |
| reversed / malformed date spans unguarded | `parseUTC` `:87`, `entryDays` `:93` — no validation | `end < start` → negative days silently pollute the denominator; bad date → NaN |
| one true mirror test | `classification.test.ts:211` (`thresholdLabel == THRESHOLD_DEFINITIONS[state]`) | near-zero signal; replace with literal-string assertions |
| `include` glob is `*.test.ts` only | `vitest.config.ts:15` | future `.spec.ts` / `.tsx` tests silently never run |

### CI gate (the phase's second deliverable)

- `vitest.config.ts`: `environment: "node"`, `include: ["src/**/*.test.ts"]`, alias
  `@`→`./src` and `astro:env/server`→a stub. `package.json:14`: `"test": "vitest run"`.
- `.github/workflows/ci.yml` steps: checkout → setup-node → `npm ci` →
  `npx astro sync` → `npm run lint` → `npm run build`. **No test step.** Phase 1
  adds `npm test` (test-plan §5 / §3 Phase 1).

## Code References

- `src/lib/classification.ts:92-100` — `entryDays` / `totalHistoryDays` (gap-day denominator, OG-1)
- `src/lib/classification.ts:103-108` — `velocityOf`, `days <= 0` guard
- `src/lib/classification.ts:126-163` — `classify` state machine, evaluation order
- `src/lib/classification.ts:137` — `velocity < 0.1` Slow-mover gate (OG-2; `velocity==0.1` coverage gap)
- `src/lib/classification.ts:157` — `Math.ceil(velocity * (leadTime + buffer_days))` (OG-3)
- `src/lib/classification.ts:151` — `leadTime == null` → OK + set-lead-time
- `src/lib/classification.test.ts:66` — `==7` boundary test (only asserts *not* Insufficient)
- `src/lib/classification.test.ts:211` — the one true mirror test
- `src/types.ts:1` — `ClassificationState` union; `Product` / `SalesEntry` interfaces
- `vitest.config.ts:15` — `include: ["src/**/*.test.ts"]`
- `.github/workflows/ci.yml` — no test step (lint + build only)
- `supabase/migrations/20260530000002_create_sales_entries.sql:5` — `units_sold … CHECK (units_sold > 0)` (bonus bug)
- `src/lib/validation/sales-entry.ts:40` — `z.number().int().nonnegative()` (bonus bug)

## Architecture Insights

- **Oracle source for this risk = PRD §Business Logic** (formulas + classification
  threshold table) + FR-006/007/008. `prd.md:148-188`. The threshold table is the
  ground truth; the code's comments referencing "the plan" are **not** oracle.
- **Two-layer fit:** Risk #2 is correctly a **unit** risk — the engine is pure
  (inputs: `Product` + `SalesEntry[]`; output: `ClassificationResult`), no DB or
  network. No mock needed; feed fixtures, assert against PRD-derived literals.
- **Anti-pattern guard for this phase:** the three oracle gaps (OG-1/2/3) are
  exactly where the "mirror implementation" anti-pattern (CLAUDE.md) would form —
  the code agrees with `plan.md`, both disagree-or-are-silent vs `prd.md`. Resolve
  from the domain first; pin second.

## Historical Context (from prior changes)

- `context/foundation/test-plan.md` §2 Risk #2, §2 Risk Response row #2 — the
  oracle-problem warning ("expected values lifted from the implementation") and the
  "4 existing unit tests already cover this" assumption this research challenges.
- `context/foundation/lessons.md` — "Wrap throw-on-error DB calls" recurred in all
  four S-0x impl-reviews; not in unit scope here, but the `units_sold` constraint
  mismatch (below) is the kind of boundary lesson that belongs to Phase 2.

## Resolved Oracle (PRD owner, 2026-06-23) — **two confirmed implementation bugs**

The three oracle gaps were taken to the PRD owner (they could not be resolved from
sources). The resolutions below are now the ground-truth oracle for Phase 1 tests.
**Two of them reveal the current implementation is wrong** — so the corresponding
tests, written against the oracle, will be RED against `classification.ts` as it
stands today.

- **OG-1 (gap-day denominator) → CALENDAR ENVELOPE.** Velocity divides by
  `max(end) − min(start) + 1` across all entries (dead gap days **count** as
  zero-sales days). Example: Jan 1–5 (10u) + Jan 20–24 (10u) → 24 days → velocity
  ≈ 0.83/day.
  **DIVERGENCE (BUG):** current `totalHistoryDays` (`classification.ts:98`) sums
  each entry's span (→ 10 days, velocity 2.0/day). The fix must compute the
  envelope. This denominator also feeds the **7-day Insufficient-data gate**
  (`:126`), so the gate's behaviour changes with it (two 4-day entries 30 days
  apart = 38-day envelope, passes the gate; under summed-spans it was 8 days).
- **OG-2 (Slow-mover vs Understocked priority) → UNDERSTOCKED WINS.** When
  `velocity < 0.1` **and** `days_of_stock < lead_time`, the imminent-stockout
  signal dominates: emit **"Order X units"**, not "Consider promotion".
  **DIVERGENCE (BUG):** current order (`classification.ts:137` before `:156`)
  returns Slow-mover first. The fix must evaluate the Understocked condition before
  the `velocity < 0.1` Slow-mover gate (the `days_of_stock >= 90` Slow rule and the
  pure low-velocity case with adequate stock stay as-is).
- **OG-3 (reorder rounding) → CEIL.** `Math.ceil(velocity × (lead + buffer))`,
  never under-order. **MATCHES** current code (`classification.ts:157`). ✓ — pin it
  with a fractional-velocity literal (8.5 → 9) to kill `ceil`→`floor`/`round`
  mutants.

**Implication for the plan (a decision for `/10x-plan`, not research):** writing
the OG-1 and OG-2 tests against the oracle produces failing tests that expose two
real bugs. Module 3 Lesson 2 is about *writing protective tests*, and the
bug→fix→regression workflow is **Lesson 5**. So the plan should decide how to
sequence these two: either (a) pin the oracle now and let the tests sit red as the
documented bug signal (e.g. `it.fails` / a skip annotated with this research +
"fix tracked for L5"), or (b) fix the two engine branches as part of this phase and
land the tests green. The remaining (correct) boundaries and OG-3 pin green
immediately and should not wait on that decision.

Non-blocking / log for later phases:
- **Bonus bug (Phase 2/3, integration):** `units_sold` is `CHECK (> 0)` in the DB
  migration but `nonnegative()` in zod and "≥ 0, dead periods lower velocity" in
  the engine comments. A zero-sales entry passes validation, then **fails at
  insert** — so the zero-velocity Slow-mover path (OG-2 / Finding #3) can't
  actually be produced through the real write path. Needs an integration test (a
  hermetic stub would lie about the CHECK). Consider `/10x-lesson`.

## Related Research

- `context/foundation/test-plan.md` §3 Phase 1 (this phase), §6.1 cookbook (to fill on ship).
- Future: `context/changes/<phase-2>/research.md` will own the API/DB-layer
  `units_sold` constraint bug and isolation/validation risks.
