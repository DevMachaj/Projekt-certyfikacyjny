# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-06-23 (Phase 1 complete — unit gate wired into CI)

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "the team
   is worried about X, and the failure would surface somewhere in <area>"
   carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents _what
   could fail_ and _why we believe it's likely_ — drawn from documents,
   interview, and codebase _signal_ (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the ground
   truth.

Hot-spot scope used for likelihood weighting: `src`, `supabase`.

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the _evidence that surfaced
this risk_ — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| #   | Risk (failure scenario)                                                                                                                                                                                                                 | Impact | Likelihood | Source (evidence — not anchor)                                                                                                                   |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Cross-account access/modification (IDOR): a request reaches or mutates another owner's products/sales because the endpoint checks _logged-in_ but not _owns-this-resource_, leaking or corrupting data across accounts                  | High   | High       | interview Q4; PRD NFR-003 (data isolation, "absolute property, not best-effort"); hot-spot dir `src/pages/api/` (15 commits/30d, untested)       |
| 2   | Velocity engine returns a plausible-but-wrong classification or reorder quantity for valid-but-edge inputs (boundary thresholds, zero / near-zero velocity, gap-day denominator), the owner acts on it, and the mistake stays invisible | High   | Medium     | interview Q1; PRD §Business Logic formulas + classification thresholds table; hot-spot dir `src/lib/` (classification + restocking churn)        |
| 3   | Server-side validation gap admits bad sales/product data (overlapping or duplicate date ranges, invalid field values) that silently corrupts the velocity denominator all classifications depend on                                     | High   | Medium     | interview Q2; PRD FR-005 (reject overlapping ranges), FR-003; roadmap S-02 risk; hot-spot dir `src/lib/validation/`                              |
| 4   | Stale, expired, absent, or tampered session reaches a protected route or API after the local-JWT `getClaims` middleware change                                                                                                          | High   | Medium     | hot-spot middleware churn (4 commits/30d) + recent commit `29876d9` "verify JWT locally via getClaims"; PRD FR-002                               |
| 5   | Unguarded throw-on-error DB call escapes as a bodyless 500 — API breaks the `{ error }` JSON contract React islands expect / SSR page hard-500s instead of degrading                                                                    | Medium | Medium     | `context/foundation/lessons.md` (recurred in all four S-0x impl-reviews); hot-spot dir `src/lib/` (db boundary churn)                            |
| 6   | AI restocking summary distorts engine-authoritative facts (quantity / selection / order) or the deterministic fallback fails to fire when the LLM is unavailable, producing a misleading plan that still "sounds fine"                  | Medium | Medium     | interview Q3; roadmap S-04/S-05 (engine authoritative, AI prose-only + deterministic fallback); hot-spot dir `src/lib/services/` (6 commits/30d) |

Risk = impact × likelihood. Order protects R1 (the absolute NFR-003
guarantee and the team's top stated fear) and R5 (recurred four times)
first. No High-impact × Low-likelihood scenarios are padded into the map;
provider-outage style failures belong to observability, not a test.

Abuse / security lens applied: R1 is an authorization/access (IDOR) row, R3
is an untrusted-input / server-side-validation-parity row, R4 is an
authentication row. The happy path excludes the attacker, so these were
added deliberately rather than emerging from the interview alone.

### Risk Response Guidance

| Risk | What would prove protection                                                                                    | Must challenge                                        | Context `/10x-research` must ground                                                                              | Likely cheapest layer                          | Anti-pattern to avoid                                                                                   |
| ---- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| #1   | Owner A's request for Owner B's product/sales returns 403/404 and never B's data, on read AND write paths      | "Logged-in == authorized for this row"                | Where ownership is enforced (RLS vs handler), whether error states leak data, which endpoints take a resource id | Integration (authed API, two distinct users)   | Asserting only the 200 happy path; over-mocking the DB so RLS never executes                            |
| #2   | Edge inputs map to the PRD threshold table's expected state and quantity                                       | "The 4 existing unit tests already cover this"        | Boundary conditions, gap-day denominator, velocity = 0 / < 0.1, the < 7-day insufficient-data gate clearing      | Unit (vitest infra exists)                     | **Oracle problem** — expected values lifted from the implementation instead of the PRD thresholds table |
| #3   | A duplicate / overlapping / invalid entry is _rejected_ and never reaches the velocity calc                    | "Client validation implies the server rejects it too" | Where overlap rejection lives (API vs DB vs both — S-02 open question), the exact definition of "overlap"        | Integration (API → validation → db)            | Testing only the client; happy-path-only                                                                |
| #4   | An expired / absent / tampered token is rejected on a protected route and API                                  | "Valid-token happy path implies invalid is rejected"  | What `getClaims` validates locally vs round-trips to Supabase, the protected-route list                          | Integration (middleware with crafted sessions) | e2e where integration suffices; trusting a single happy login                                           |
| #5   | A forced DB error yields `{ error }` JSON (API) / empty-state render (SSR), not a bodyless 500                 | "It works, so the error path works"                   | Which call sites are still unguarded, the `readError()` contract the islands expect                              | Integration (API with an induced failure)      | Only testing success; mocking away the throw                                                            |
| #6   | Engine quantity/selection/order appear unchanged in the AI output; fallback prose renders when the LLM is down | "Output sounds reasonable, so it is correct"          | The engine → AI boundary, what the fallback path emits, how LLM-unavailable is detected                          | Unit / integration on the service              | AI-native eval over a deterministic diff that already catches fact-drift                                |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| #   | Phase name                                          | Goal (one line)                                                                                                  | Risks covered | Test types         | Status      | Change folder                                        |
| --- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------- | ------------------ | ----------- | ---------------------------------------------------- |
| 1   | Velocity engine correctness                         | Edge-case classification and reorder quantity match the PRD threshold table; wire the unit gate into CI          | #2            | unit               | complete    | context/changes/testing-velocity-engine-correctness/ |
| 2   | API contract: isolation, validation, error envelope | Cross-account requests rejected; bad data rejected; DB errors degrade cleanly; bootstrap the integration harness | #1, #3, #5    | integration        | not started | —                                                    |
| 3   | Auth boundary                                       | Stale / expired / forged session rejected on protected routes and API                                            | #4            | integration        | not started | —                                                    |
| 4   | AI recommendation integrity                         | Engine facts survive unchanged into AI prose; deterministic fallback fires when the LLM is unavailable           | #6            | unit + integration | not started | —                                                    |

**Status vocabulary** (fixed — parser literals): `not started` → `change opened` → `researched` → `planned` → `implementing` → `complete`.

Order rationale: Phase 1 leads because the unit infra already exists, it
defends the product's core differentiator at the cheapest layer, and it
addresses the top stated fear (silently-wrong analysis) fast. Phase 2 is
the highest-impact cluster (NFR-003 absolute isolation + the team's API
concern) and bootstraps the integration harness every later phase reuses.
Phase 3 reuses that harness to close the authentication half of isolation.
Phase 4 is last: the engine is authoritative for the AI plan, so its
correctness impact is bounded, and it benefits from the harness.

## 4. Stack

The classic test base for this project. AI-native tools (if any) carry a
`checked:` date so future readers can see which lines need re-verification.

| Layer                | Tool                                                        | Version | Notes                                                                                                                                                                        |
| -------------------- | ----------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| unit + integration   | Vitest                                                      | ^3.2.4  | Configured (`vitest.config.ts`, node env, `@/*` alias mirrored). 4 unit tests today, all in `src/lib/`. `npm test` = `vitest run`.                                           |
| integration (API)    | none yet — see §3 Phase 2                                   | —       | No harness for the Astro/Cloudflare Worker request path or Supabase-backed routes yet. Phase 2 selects and wires it.                                                         |
| e2e                  | none — deliberately deferred                                | —       | Not warranted at MVP scale; integration covers the API risks more cheaply (§1 cost × signal). Re-evaluate if a DOM-only failure mode appears.                                |
| accessibility        | none — out of scope                                         | —       | Negative space (§7): cosmetic/UI behavior is not a budgeted risk.                                                                                                            |
| (optional) AI-native | LLM-judge / eval for AI prose quality — checked: 2026-06-23 | n/a     | Only for Risk #6 _prose quality_. **When NOT to use:** never over the deterministic fact-drift / fallback assertions — those catch the regression that matters more cheaply. |

**Stack grounding tools (current session):**

- Docs: none (Context7 not exposed) — relied on local `package.json` / `vitest.config.ts` / `astro.config.mjs` for versions and setup; checked: 2026-06-23
- Search: Exa MCP — available; not used for this write (versions came from local manifests); use it in research to confirm an integration-harness tool's currency for Astro 6 + Cloudflare Workers; checked: 2026-06-23
- Runtime/browser: none (no Playwright MCP) — an e2e/browser layer is not in this rollout; wiring would be a future phase if a DOM-only risk surfaces; checked: 2026-06-23
- Provider/platform: Supabase MCP — available (schema/read); relevant to verifying RLS enforcement for Risk #1 during Phase 2 research; checked: 2026-06-23

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.
"Required after §3 Phase <N>" means the gate is enforced once that rollout
phase lands; before that, the gate is `planned`.

| Gate              | Where                | Required?                       | Catches                                                                            |
| ----------------- | -------------------- | ------------------------------- | ---------------------------------------------------------------------------------- |
| lint              | local + CI           | required (wired)                | syntactic drift, a11y and React-rules violations                                   |
| typecheck         | local + CI           | required (wired)                | type drift                                                                         |
| depcruise         | local + CI           | required (wired)                | architecture/dependency-rule violations                                            |
| build (SSR)       | CI                   | required (wired)                | broken production build                                                            |
| unit              | local + CI           | required (wired)                | velocity/classification logic regressions                                          |
| integration (API) | local + CI           | required after §3 Phase 2       | isolation, validation, and error-contract regressions                              |
| post-edit hook    | local (agent loop)   | recommended (Module 3 Lesson 3) | regressions at edit time                                                           |
| pre-prod smoke    | between merge + prod | optional                        | environment-specific failures (e.g. the migration-drift 500 noted in `lessons.md`) |

CI runs `typecheck` → `depcruise` → `lint` → `test` → `build`
(`.github/workflows/ci.yml`); the `unit` gate (`npm test`) was wired in §3
Phase 1, and `typecheck` + `depcruise` were wired in the `ci-cd-code-review`
change (2026-07-27) — before that both were configured in `package.json` but
ran nowhere in CI, so a `--no-verify` commit could ship type errors through a
green PR. Phase 2 adds the `integration` gate. Hook and MCP configuration are
out of scope for this lesson (Module 3 Lessons 3–4).

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once the
relevant rollout phase ships; before that, the sub-section reads
"TBD — see §3 Phase <N>."

### 6.1 Adding a unit test

Canonical example: `src/lib/classification.test.ts` (run with `npm test` = `vitest run`).
Pattern established in §3 Phase 1 (`testing-velocity-engine-correctness`):

1. **Oracle from sources, never from the code.** Every expected value comes from
   the PRD threshold table / §Business Logic formulas (or a PRD-owner ruling
   recorded in research) — never recomputed with the function under test. The
   mirror anti-pattern looks like `expect(x).toBe(THRESHOLD_DEFINITIONS[result.state])`
   or `expect(totalHistoryDays(e)).toBe(5 + 4)`: it re-derives the answer the same
   way the impl does, so it passes against a bug. Assert the literal instead
   (`toBe(35)`, `toBe("Fewer than lead-time days of stock remaining…")`). When the
   sources don't resolve a value unambiguously, **stop and ask** — that ruling is
   the oracle (e.g. OG-1 calendar-envelope, OG-2 Understocked-wins).
2. **Pin every boundary as a literal.** For each threshold use the exact-boundary
   inputs: `velocity == 0.1` (strict `<` ⇒ not Slow-mover), `days_of_stock == lead`,
   `== 2×lead`, `== 90`, the `== 7`-day insufficient-data gate. Assert the _resulting
   state and recommendation_, not merely "not the wrong one" — a test that only
   asserts `!= "Insufficient data"` lets a wrong-band regression through.
3. **One edge case per risk minimum:** zero / near-zero velocity, the gap-day
   denominator (envelope counts dead days), empty input, dependency error.
4. **Parameterize duplicates.** Six near-identical cases → one `it.each` with one
   row per property; each row catches a distinct regression (see the five
   `THRESHOLD_DEFINITIONS` rows). Do not copy-paste a case to bump coverage.
5. **Selective mutation gate (ad-hoc, not CI):** after a risk phase is green, run
   `npx stryker run --mutate "src/lib/<module>.ts"` (config: `stryker.conf.json`,
   vitest runner). For each survivor ask _"would this change hurt a user or the
   business?"_ — yes ⇒ add a literal-derived assertion that kills it (this is how
   `recommendationText` coverage and the FR-006 legend strings got pinned); no
   (equivalent / cosmetic) ⇒ ignore consciously and record why. Do not chase 100%:
   the three surviving `!= null` guards at `classification.ts:152/162/173` are
   provably equivalent (unreachable-false after the velocity gate, and `x < null`
   is already false), so they stay. Pinning them would be a vibe test.

### 6.2 Adding an integration test

- TBD — see §3 Phase 2 (API isolation/validation/error-envelope pattern:
  two-user cross-account assertion, induced-DB-error assertion; mock only
  at the network/Supabase edge, never internal modules).

### 6.3 Adding an e2e test

- Out of scope for this rollout — see §4. Revisit only if a DOM-only
  failure mode appears.

### 6.4 Adding a test for a new API endpoint

- TBD — see §3 Phase 2 (cover ownership check, server-side validation
  parity, and the `{ error }` failure contract — not just the 200 path).

### 6.5 Adding a test for the auth boundary

- TBD — see §3 Phase 3 (crafted-session pattern: expired / absent / tampered
  token rejected on a protected route and API).

### 6.6 Adding a test for AI recommendation integrity

- TBD — see §3 Phase 4 (engine-facts-survive-unchanged assertion +
  fallback-fires-when-LLM-down assertion).

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5). Future
contributors should respect these unless the underlying assumption changes.

- **Third-party UI primitives (`src/components/ui/`, shadcn/ui)** — the
  library is the test; trust it. Re-evaluate if we fork or heavily customize
  a primitive. (Source: Phase 2 interview Q5.)
- **Cosmetic frontend behavior and visual snapshots of static pages** —
  high churn, low signal; the budgeted risks are data correctness,
  isolation, validation, and recommendation accuracy. Re-evaluate if a
  rendering regression ever causes a real user-facing incident. (Source:
  Phase 2 interview Q5.)
- **Supabase SDK / auth internals** — sign-in/sign-up/sign-out wrap the SDK;
  trust the SDK, test only our glue (the auth boundary is covered as Risk #4,
  the glue — not the SDK). Re-evaluate on a major `@supabase/ssr` upgrade.
  (Source: Phase 2 interview Q5.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-06-23
- Stack versions last verified: 2026-06-23
- AI-native tool references last verified: 2026-06-23
- §5 gate table corrected: 2026-07-27 — `typecheck` and `depcruise` were listed
  as wired while running nowhere in CI; both are now real CI steps
  (`ci-cd-code-review` Phase 1)

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
