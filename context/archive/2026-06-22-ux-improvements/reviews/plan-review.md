<!-- PLAN-REVIEW-REPORT -->

# Plan Review: UX Improvements (S-06)

- **Plan**: `context/changes/ux-improvements/plan.md`
- **Mode**: Deep
- **Date**: 2026-06-22
- **Verdict**: REVISE → SOUND (all findings fixed in triage)
- **Findings**: 0 critical, 2 warnings, 1 observation

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

6/6 paths ✓, symbols ✓ (204 at `src/pages/api/products/[id].ts:71`, `ProductCatalog` mount at `src/pages/products.astro:27`, `cn` at `src/lib/utils.ts:4`), brief↔plan ✓, Progress↔Phase mechanical contract ✓. Blast radius tiny: `DeleteProductDialog` imported only by `ProductCatalog`; `BulkDeleteDialog` and `checkbox` are new.

## Findings

### F1 — "npm run build" does not type-check; the gate is a no-op for types

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: All three phases — Automated Verification
- **Detail**: `build` = `astro build` (package.json), which does NOT run `astro check`; `@astrojs/check ^0.9.8` is a separate dep. ESLint `projectService: true` (eslint.config.js:18) gives type-aware lint rules but not `tsc` type-checking. CI runs sync→lint→build with no check step. A `.tsx` type error would pass the plan's automated gate.
- **Fix**: Add `"typecheck": "astro check"` to package.json and reference `npm run typecheck` in all three phases (kept `npm run build` as a separate build-passes check). Renumbered Progress accordingly.
- **Decision**: FIXED (Fix differently — added typecheck npm script; baked into Phase 1 step 2, swapped command in all phases + Progress)

### F2 — BulkDeleteDialog `open` trigger: the primary phrasing is a bug

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 — Count-aware bulk confirmation dialog
- **Detail**: Contract said `open` "driven by `count > 0` (or a separate `open` boolean — implementer's choice)". `count > 0` is the bulk-bar-visible condition, so binding `open` to it would pop the dialog open the instant a product is checked, before "Delete selected" is clicked.
- **Fix**: Added `open` to the prop list; required it be driven by a dedicated boolean set on the "Delete selected" click (mirroring `deleteTarget`); `count` used only for title/description text. Dropped the `count > 0` option.
- **Decision**: FIXED (Fix in plan)

### F3 — Partial-failure banner needs failed product names while the loop mutates `products`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 — Sequential bulk-delete handler
- **Detail**: Plan is internally consistent (failed products remain in `products`), but the failure message should be built from a pre-loop `{id, name}` snapshot rather than the mid-iteration array.
- **Fix**: Added a sentence to the Phase 2 handler contract: snapshot `{id, name}` for the selected set before the loop; build the failure banner from that snapshot.
- **Decision**: FIXED (Fix in plan)
