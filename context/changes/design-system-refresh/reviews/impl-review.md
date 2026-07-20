<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: S-08 Design System Refresh

- **Plan**: context/changes/design-system-refresh/plan.md
- **Scope**: All 3 phases (complete)
- **Date**: 2026-07-20
- **Verdict**: APPROVED
- **Findings**: 0 critical · 1 warning · 3 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

Notes: no substantive drift (all planned changes MATCH); scope boundaries fully held (no screen/`FormField`/auth file touched, button variant keys preserved, all 20 status tokens present, every arbitrary CSS var verified defined). Success Criteria: build ✓ / typecheck ✓ / 73 unit tests ✓; E2E 4/5 accepted (seed.spec fails on an expired `playwright/.auth/user.json` fixture, not a regression); whole-repo lint's 1 error is the pre-existing unrelated `.dependency-cruiser.cjs` parse error.

## Findings

### F1 — /design-preview is a live public route in production

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/design-preview.astro:1
- **Detail**: The file comments say "dev-only / not a shipped route", but with `output: "server"` every `.astro` page is a live route. `/design-preview` is publicly reachable in production, is NOT in `PROTECTED_ROUTES` (`src/middleware.ts:4`), and ships a `client:only="react"` bundle (`DesignSystemPreview`) to the edge. No data leak (static tokens/components only) so severity is bounded, but it's unintended public surface + dead bundle weight, and the comment misrepresents reality. The plan explicitly deferred this ("gate or remove before shipping to production, per team preference").
- **Fix A ⭐ Recommended**: Gate to non-prod — add `if (import.meta.env.PROD) return Astro.redirect("/404")` (or a 404 status) at the top of the page frontmatter.
  - Strength: Removes the public surface + edge bundle in one line; keeps the page fully usable in dev; matches the plan's stated intent.
  - Tradeoff: The S-09 reference page becomes dev-only (fine — S-09 runs in dev anyway).
  - Confidence: HIGH — trivial, standard Astro guard.
  - Blind spot: None significant.
- **Fix B**: Leave public, fix the comment — accept the minor public surface; correct the "not a shipped route" comment to reflect reality.
  - Strength: Zero routing logic; page stays viewable anywhere.
  - Tradeoff: Ships an internal design page + JS bundle to real users.
  - Confidence: HIGH.
  - Blind spot: None.
- **Decision**: PENDING

### F2 — .dark block retains the old pre-refresh (grayscale) palette

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: src/styles/global.css:200
- **Detail**: Intentional deferral (dark = future work), but the `dark:` variant classes in `button.tsx`/`checkbox.tsx` would render against the stale palette if `.dark` were ever enabled.
- **Fix**: Leave as a conscious deferral; revisit if/when a dark theme ships (S-08 chose light-only, `.dark` inert).
- **Decision**: PENDING

### F3 — Input `suffix` unit not programmatically associated

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/ui/input.tsx:45
- **Detail**: The unit (e.g. "dni", "szt.") is a decorative `pointer-events-none` span; screen readers don't announce it. Fine for the preview; matters when S-09 wires `Input` into real forms.
- **Fix**: Defer to S-09 (`aria-describedby` on the input, or fold the unit into the accessible label).
- **Decision**: PENDING

### F4 — badge.tsx uses `as const` tone maps instead of cva

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/ui/badge.tsx:10
- **Detail**: Reasonable — the primary variant axis (`state`) is data-driven off the engine and reuses the shared `STATE_STYLES`/`STATE_DOT` maps, so `cva` would add little. Not worth changing.
- **Fix**: None needed.
- **Decision**: PENDING
