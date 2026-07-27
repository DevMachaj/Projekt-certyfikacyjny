# Definition of Done

> The rubric a change is scored against before it is considered done. Written for
> two readers: a human deciding whether a PR is finished, and the CI review agent
> at `.github/actions/ai-review/` that scores a diff against it.
>
> Last updated: 2026-07-27 (created — `ci-cd-code-review` Phase 2)

## How this document is owned

**Owner: the repository maintainer.** No skill writes this file. Unlike
`lessons.md` (written by `/10x-impl-review`) or `test-plan.md` (written by
`/10x-test-plan`), nothing regenerates this document — so it goes stale silently
unless someone edits it deliberately. That is the cost of it being the one
foundation doc without a skill behind it.

**Update trigger: a violation that recurs twice gets a criterion.** This mirrors
the loop that produced `context/foundation/lessons.md` — that file was written
after the _third_ appearance of one bug class
(`context/archive/2026-06-06-classification-dashboard/reviews/impl-review.md:30`),
and the next impl-review then explicitly verified compliance with it. Two
recurrences is the bar here because the third is what already hurt. Add the
criterion at the end of its group with the next free id; do not renumber.

**Stable-id contract.** Every criterion carries a permanent `#N`. The CI
reviewer cites these ids in PR comments, and past reviews reference them, so an
id is never reused, never renumbered, and never repurposed. A retired criterion
is struck through in place, not deleted.

**Document order is by recurrence, not by id.** Within each group, criteria
appear most-recurrent-first, ranked by how often that failure actually showed up
in nine archived `impl-review.md` reports. Ids are stable references and
therefore run out of numeric order. Read top-down; look up by id.

**The runtime prompt reads the base-branch copy.** The CI action resolves this
file from `origin/<base-ref>`, never from the PR head, so a pull request cannot
weaken the rubric it is judged by. A PR that edits this file is still scored
against `main`'s version — the edit takes effect only once merged. Test a rubric
change locally by pointing `DOD_PATH` at the working-tree copy.

## Enforcement legend

| Tag            | Meaning                                                                                   |
| -------------- | ----------------------------------------------------------------------------------------- |
| **AUTO-CI**    | A gate that runs on every PR today (`.github/workflows/ci.yml`). Zero judgement needed.   |
| **AUTO-LOCAL** | A tool that is configured but deliberately not wired into CI. Run by hand.                |
| **LLM**        | Only a human or an LLM can check it. This is the addressable surface for the CI reviewer. |

**Tally: 7 AUTO-CI · 1 AUTO-LOCAL · 41 LLM.** The AUTO-CI count was 5 before the
`ci-cd-code-review` change wired `typecheck` and `depcruise` into CI (#25, #26);
those two moved out of the LLM's plate entirely. ~84% of this rubric is still
LLM-only, which is why an AI reviewer is not redundant with the linter here.

Four criteria are **not answerable from the diff alone** and are marked `↗`:
**#11** (needs `src/middleware.ts`), **#22** and **#24** (need sibling files),
**#47** (needs all consumers of a renamed symbol). If that set grows, the CI
reviewer needs repo reads and the architecture has to change — see
`context/changes/ci-cd-code-review/research.md` §3, "the escalation test".

---

## A1 — Correctness & Reliability (7)

The unguarded throw-on-error DB call is the repo's **single most recurrent
defect** — three direct hits, promoted to the only entry in `lessons.md`. It
leads this group and it leads the whole document.

| #   | Criterion                                                                                                                                                                                                                            | Source                                                                       | Tag         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- | ----------- |
| 1   | Every call to a throw-on-error `src/lib/db.ts` helper from an API route or `.astro` frontmatter is wrapped in `try/catch`.                                                                                                           | `context/foundation/lessons.md:11`                                           | LLM         |
| 2   | An API-route `catch` returns `Response.json({ error }, { status: 500 })`, preserving any more-specific status already handled (e.g. the 409 exclusion-violation path).                                                               | `lessons.md:11`; `src/pages/api/products/index.ts:19-24`                     | LLM         |
| 3   | SSR page frontmatter degrades to a safe empty value (`groups = []`, `initialProducts = []`) instead of hard-500-ing the page.                                                                                                        | `lessons.md:11`; `.../2026-06-06-classification-dashboard/impl-review.md:30` | LLM         |
| 4   | `createClient()` returning `null` is guarded separately from the DB-throw path — 503 in an API route, empty fallback on a page.                                                                                                      | `lessons.md:11`; `src/pages/api/products/index.ts:15-17`                     | LLM         |
| 5   | An external-service call carries a timeout whose abort is cleared in `finally`, and every failure mode (non-2xx, unexpected `stop_reason`, parse failure, network, abort) degrades to a deterministic fallback rather than throwing. | `.../2026-06-07-ai-weekly-restocking-plan/impl-review.md:28`                 | LLM         |
| 6   | An in-flight mutation disables every control that could race it — not only the control that started it.                                                                                                                              | `.../2026-06-22-ux-improvements/impl-review.md:35`                           | LLM         |
| 7   | `npm run build` succeeds.                                                                                                                                                                                                            | `package.json:7`; `.github/workflows/ci.yml`                                 | **AUTO-CI** |

## A2 — Security, Authorization & Isolation (8)

Authorization depth beyond "is this request logged in" is **rank 3** by
recurrence — four hits. Unintended public surface is a single hit but the
highest-signal one in the archive.

| #   | Criterion                                                                                                                                                                                         | Source                                                                                            | Tag |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | --- |
| 8   | A handler checks `context.locals.user` **and** that the user owns the addressed row. "Logged in" is not "authorized for this row".                                                                | `test-plan.md:42,63` (Risk #1); `.../2026-05-31-sales-entry-and-classification/impl-review.md:73` | LLM |
| 9   | Every `FOR UPDATE` RLS policy carries **both** `USING` and `WITH CHECK` — `USING` gates which rows may be updated, `WITH CHECK` gates the new values.                                             | `.../2026-05-30-supabase-schema-and-types/impl-review.md:30`                                      | LLM |
| 10  | A nested route scopes the child by the parent id from the URL path, not by the child id alone.                                                                                                    | `.../2026-05-31-sales-entry-and-classification/impl-review.md:73`                                 | LLM |
| 11  | ↗ A new protected `.astro` page is added to `PROTECTED_ROUTES`. Under `output: "server"` **every `.astro` file is a live public route** — a new page is a security-relevant event.                | `src/middleware.ts:4`; `.../2026-07-20-design-system-refresh/impl-review.md:32`                   | LLM |
| 12  | A new table enables RLS with granular per-operation, per-role policies.                                                                                                                           | `CLAUDE.md:39`                                                                                    | LLM |
| 13  | A write that relies on RLS alone for tenant isolation, with no app-layer owner scope, is a recorded deliberate decision — not an oversight.                                                       | `.../2026-05-30-product-catalog-crud/impl-review.md:44`                                           | LLM |
| 14  | An irreversible or destructive mutation states its CSRF posture, even if the defense is incidental (e.g. reliance on `SameSite=Lax`), so a future cookie-config change cannot silently remove it. | `.../2026-06-22-account-deletion-and-data-retention/impl-review.md:31`                            | LLM |
| 15  | Secrets stay server-side and never reach a client island; a missing secret degrades explicitly (503) rather than silently.                                                                        | `astro.config.mjs:17-24`; `.../2026-06-07-ai-weekly-restocking-plan/impl-review.md:28`            | LLM |

## A3 — Conventions & Architecture (13)

Pattern divergence from sibling files is **rank 4** — roughly five hits, always
WARNING or lower. Note that Architecture and Pattern Consistency have **never**
returned a FAIL verdict in nine reviews; weight this group accordingly.

| #   | Criterion                                                                                                                                                                                                                                                                         | Source                                                          | Tag         |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ----------- |
| 24  | ↗ New or changed code matches the naming, error-handling, and import idiom of 1–2 sibling files in the same directory.                                                                                                                                                            | archive rank 4 (~5 hits); `CLAUDE.md:32-42`                     | LLM         |
| 20  | A shipped migration is never edited. A correction lands as a new forward migration.                                                                                                                                                                                               | `.../2026-05-30-supabase-schema-and-types/impl-review.md:31,36` | LLM         |
| 22  | ↗ Business logic is extracted into `src/lib/services/`, not inlined in a route handler or a React island.                                                                                                                                                                         | `CLAUDE.md:41`                                                  | LLM         |
| 16  | API routes use uppercase `GET` / `POST` exports and validate input with a zod `safeParse`, returning 400 with the issues on failure.                                                                                                                                              | `CLAUDE.md:38`; `src/pages/api/products/index.ts:45-48`         | LLM         |
| 17  | Shared entity and DTO types live in `src/types.ts`.                                                                                                                                                                                                                               | `CLAUDE.md:42`                                                  | LLM         |
| 18  | React components are used only where interactivity is genuinely needed; static content and layout stay `.astro`.                                                                                                                                                                  | `CLAUDE.md:35`                                                  | LLM         |
| 19  | Hooks are extracted to `src/components/hooks/`.                                                                                                                                                                                                                                   | `CLAUDE.md:40`                                                  | LLM         |
| 21  | Imports use the `@/*` path alias rather than deep relative paths.                                                                                                                                                                                                                 | `CLAUDE.md:34`                                                  | LLM         |
| 23  | `npm run lint` passes — eslint with type-checked rules, plus prettier as a lint rule.                                                                                                                                                                                             | `package.json:11`                                               | **AUTO-CI** |
| 25  | `npm run typecheck` reports 0 errors (`astro sync && astro check`).                                                                                                                                                                                                               | `package.json:10`                                               | **AUTO-CI** |
| 26  | `npm run depcruise` reports no `error`-severity violations.                                                                                                                                                                                                                       | `package.json:16`; `.dependency-cruiser.cjs:86,97,123,142`      | **AUTO-CI** |
| 27  | Code is prettier-formatted (`prettier-plugin-astro` + `prettier-plugin-tailwindcss`).                                                                                                                                                                                             | `CLAUDE.md:12,14`                                               | **AUTO-CI** |
| 28  | **low-priority** — the four never-flagged conventions: API routes export `const prerender = false`; migrations are named `YYYYMMDDHHmmss_short_description.sql`; no Next.js directives (`"use client"`); `cn()` is used for conditional classes rather than string concatenation. | `CLAUDE.md:22,39,40,36`                                         | LLM         |

**On #28.** These four have a **100% clean track record** — not one of nine
archived reviews ever flagged any of them. They stay documented for
completeness, but the reviewer prompt explicitly tells the model not to spend
attention there. Attention spent on #28 is attention not spent on #1.

## A4 — Testing (11)

`#30` is the single highest-value LLM-only criterion in this document: an
expectation recomputed with the function under test passes against a bug, and no
linter will ever catch it.

| #   | Criterion                                                                                                                                                                                                                 | Source                                   | Tag            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | -------------- |
| 30  | Every expected value comes from the PRD, the threshold table, or a recorded ruling — **never recomputed with the function under test**. Assert the literal (`toBe(35)`), not `toBe(THRESHOLD_DEFINITIONS[result.state])`. | `test-plan.md:144-152`                   | LLM            |
| 31  | Every threshold is pinned with exact-boundary inputs, asserting the _resulting state and recommendation_ — not merely that it is not the wrong one.                                                                       | `test-plan.md:153-157`                   | LLM            |
| 32  | At least one edge case per risk: zero / near-zero velocity, the gap-day denominator, empty input, dependency error.                                                                                                       | `test-plan.md:158-160`                   | LLM            |
| 33  | A new or changed API endpoint has integration coverage for ownership, server-side validation parity, and the `{ error }` failure contract — not only the 200 path.                                                        | `test-plan.md:124,186-187`               | LLM            |
| 34  | Near-identical cases are parameterized into one `it.each`, one row per property, each row catching a distinct regression. Copy-pasted cases that only bump coverage are not acceptable.                                   | `test-plan.md:161-163`                   | LLM            |
| 29  | New or changed business logic in `src/lib/` carries unit tests.                                                                                                                                                           | `test-plan.md:123`                       | LLM            |
| 35  | **Negative space** — a diff touching `src/components/ui/` (shadcn primitives) does **not** add tests. The library is the test.                                                                                            | `test-plan.md:204-206`                   | LLM            |
| 36  | **Negative space** — cosmetic frontend behavior, visual snapshots of static pages, and Supabase SDK / auth internals are **not** tested. Only our glue is.                                                                | `test-plan.md:207-215`                   | LLM            |
| 37  | **Negative space** — e2e is not added where integration suffices. Do not promote a test because e2e "feels safer".                                                                                                        | `test-plan.md:103,181-182`               | LLM            |
| 38  | After a risk phase goes green, the selective Stryker mutation gate is run ad-hoc; each survivor is either killed by a literal-derived assertion or consciously ignored with a recorded reason.                            | `test-plan.md:164-171`                   | **AUTO-LOCAL** |
| 39  | `npm test` passes, and any newly added test file is actually collected by the runner.                                                                                                                                     | `package.json:14`; `vitest.config.ts:15` | **AUTO-CI**    |

**On the negative space (#35–#37).** These are **deliberate decisions, not
omissions.** They were agreed in the Phase 2 test-plan interview and are recorded
at `test-plan.md:199-215`. Without them in the rubric, an LLM reviewer will
reliably demand tests for `src/components/ui/` and train you to ignore its
output. A criterion that says "do not test this" is doing real work.

## A5 — Accessibility & UX (4)

Two hits in the archive, **both invisible to `eslint-plugin-jsx-a11y`**, which
only inspects static attributes. Everything dynamic in a React island is
LLM-or-human territory.

| #   | Criterion                                                                                                                                                                                           | Source                                                   | Tag         |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ----------- |
| 40  | Dynamic progress or status text carries `aria-live`, so screen-reader users get the update.                                                                                                         | `.../2026-06-22-ux-improvements/impl-review.md:55-56`    | LLM         |
| 41  | Decorative text that carries meaning (a unit suffix like "dni" / "szt.") is programmatically associated with its control, not left as a `pointer-events-none` span.                                 | `.../2026-07-20-design-system-refresh/impl-review.md:61` | LLM         |
| 42  | Error, empty, and loading states are distinguishable and actionable; an expired session is not silently collapsed into a generic "try again" where the distinction changes what the user should do. | `.../2026-06-22-ux-improvements/impl-review.md:45`       | LLM         |
| 43  | Static JSX accessibility rules pass (`eslint-plugin-jsx-a11y`).                                                                                                                                     | `eslint.config.js`                                       | **AUTO-CI** |

## A6 — Scope & Context Discipline (6)

Plan↔code drift is **rank 5** — three hits. **This entire group is out of scope
for the CI reviewer** and stays with `/10x-impl-review` locally: a diff-only
reviewer cannot resolve `context/changes/<id>/plan.md`, because branch names in
this repo (`feature/account-deletion`) do not map to change-ids
(`2026-06-22-account-deletion-and-data-retention`). Criteria **#44–#47** are the
plan-adherence core of that exclusion.

| #   | Criterion                                                                                                                                                | Source                                                                      | Tag |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | --- |
| 45  | The plan's "What We're NOT Doing" boundaries are respected. An extra change inside a guardrailed area is documented as an addendum, not landed silently. | `.../2026-05-31-sales-entry-and-classification/impl-review.md:44`           | LLM |
| 46  | A schema or contract change decided during implementation is reflected back into the plan, so the plan does not go stale against the code.               | `.../2026-05-31-sales-entry-and-classification/impl-review.md:63`           | LLM |
| 47  | ↗ A specified rename is carried through **all** consumers — not only the wire DTO, leaving the internal type behind.                                     | `.../2026-06-17-restocking-plan-decision-support/impl-review.md:31`         | LLM |
| 44  | Every planned change is implemented as described; anything MISSING or materially DRIFTed is surfaced rather than quietly dropped.                        | `.claude/skills/10x-impl-review/SKILL.md:150`                               | LLM |
| 48  | A violation that recurs twice is appended to `context/foundation/lessons.md` — the capture loop stays fed.                                               | `lessons.md:3`; `.../2026-06-06-classification-dashboard/impl-review.md:36` | LLM |
| 49  | A document that makes a factual claim about what CI or tooling does is corrected when the claim goes stale.                                              | `test-plan.md:121` (was wrong for ~5 weeks); `CLAUDE.md:54`                 | LLM |

---

## What the reviewer hunts for first

The recurring-failure ranking from nine archived reviews, most-recurrent first.
This is the attention budget, in order:

1. **Unguarded throw-on-error DB call at an SSR/API boundary** — 3 direct hits;
   the repo's only recorded lesson. (#1–#4)
2. **Safety & Quality degradation** — WARNING in **7 of 9** reviews, the only
   dimension that ever degrades. (A1, A2)
3. **Authorization depth beyond "is logged in"** — 4 hits. (#8–#11)
4. **Pattern divergence from sibling files** — ~5 hits, always WARNING or lower. (#24)
5. **Plan↔code drift / undocumented scope creep** — 3 hits. (#44–#47, local only)
6. **Accessibility in React islands** — 2 hits, both invisible to `jsx-a11y`. (#40–#42)
7. **Unintended public surface under `output: "server"`** — 1 hit, high signal. (#11)

**Calibration.** Nine archived reviews produced **zero CRITICAL findings**. A
gate on "any CRITICAL in Correctness/Reliability or Security/Isolation" would
have blocked nothing historically — and a laxer one would have missed the RLS
`WITH CHECK` hole (#9). That is the threshold the CI reviewer computes.

## Review discipline

Rules the reviewer follows, carried over verbatim from `/10x-impl-review` and
`/10x-plan-review` so local and CI review speak one language:

- **Cap at 10 findings**; consolidate beyond that. (`10x-impl-review/SKILL.md:162`)
- **Don't flag style preferences unless they matter.** (`:436`)
- **If the diff is genuinely good, say so briefly and stop. Don't manufacture
  findings.** (`10x-plan-review/SKILL.md:393`)
- Severity vocabulary is `CRITICAL` / `WARNING` / `OBSERVATION`; dimensions are
  the six in `10x-impl-review/SKILL.md:117`.

## References

- `context/foundation/lessons.md` — the recurring-rule register; #1–#4 come from it
- `context/foundation/test-plan.md` — §5 gate table (#23, #25, #26, #39), §6.1 oracle rules (#30–#34), §7 negative space (#35–#37)
- `context/changes/ci-cd-code-review/research.md` §2 — the mining pass that produced this rubric, with per-source provenance
- `.claude/skills/10x-impl-review/SKILL.md` — severity, impact, and dimension taxonomy
- `context/archive/*/reviews/impl-review.md` — the nine reviews this ranking is derived from
