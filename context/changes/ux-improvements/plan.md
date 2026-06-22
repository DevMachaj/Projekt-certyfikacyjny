# UX Improvements (S-06) Implementation Plan

## Overview

Close three friction points observed while building S-01 through S-05, **UI only** — no schema, no classification-engine changes, no new API routes, no new `src/lib/db.ts` helpers:

1. **Bulk actions during catalog review** — select multiple products and delete them in one gesture instead of one row at a time.
2. **Reset a review session** — a "Clear selection" control that deselects everything and exits the selection state.
3. **Clear loading states** — visible progress during the bulk delete, and a skeleton placeholder for the restocking-plan candidate list while it fetches.

The bulk delete is implemented as a **client-side sequential loop over the existing `DELETE /api/products/[id]` endpoint**. This is a hard constraint: it avoids a merge conflict with the parallel S-07 slice, which is expected to touch `src/lib/db.ts`. No bulk endpoint and no new `db.ts` helper are added.

## Current State Analysis

- **`src/components/products/ProductCatalog.tsx`** — the catalog island (`client:load`, mounted from `src/pages/products.astro`). Owns `products: Product[]`, `formTarget`, `deleteTarget: Product | null`, `pending`, `formError`, `listError`. Single delete (`handleDelete`, lines 89–108) calls `DELETE /api/products/${id}`, and on success optimistically filters the row out of `products`. A local `readError(res, fallback)` helper (lines 20–28) reads `{ error }` from the JSON body. List-level failures render as a dismissible inline banner (lines 122–137). Each product row (lines 154–197) has ghost-icon Edit + Delete buttons.
- **`src/components/products/DeleteProductDialog.tsx`** — confirmation modal taking `product: Product | null`, `pending`, `onConfirm`, `onCancel`. `open` is driven by `product !== null`. Destructive confirm button shows `"Deleting..."` while `pending`. This is the single-delete dialog; the bulk flow needs a count-aware sibling.
- **`DELETE /api/products/[id].ts`** — returns **204 No Content** on success (no body); on failure returns `{ error: string }` with status 400 / 401 / 404 / 500 / 503. Cascades to `sales_entries` via DB `ON DELETE CASCADE`. This endpoint is unchanged by this plan.
- **`src/components/dashboard/RestockingPlan.tsx`** — dashboard island. "Generate" button → `POST /api/restocking-plan` → renders a read-only candidate list. Already has `pending`/`error`/`plan` state and a `Loader2` button spinner ("Generating…"). The gap: while in flight there is no placeholder for the *list* area — only the button changes.
- **shadcn/ui inventory** — only `button` and `dialog` are installed under `src/components/ui/`. **`checkbox` is not installed** and must be added with `npx shadcn@latest add checkbox`. There is no shared Spinner/Skeleton component; `Loader2` from `lucide-react` with `animate-spin` is the established spinner idiom. There is no toast library — inline banners + `readError` are the convention.
- **State conventions** — every island owns its own `useState`; no global store, no context. `cn()` from `@/lib/utils` is used for class merging. No `src/components/hooks/` directory exists yet.

### Key Discoveries:

- `DELETE /api/products/[id]` returns **204 with no body** on success (`src/pages/api/products/[id].ts`) — the loop checks `res.ok`, it must NOT try to parse JSON on success.
- The optimistic-filter pattern already exists (`ProductCatalog.tsx:101`) — the bulk loop generalizes it from one id to a set of succeeded ids.
- `readError` and the inline dismissible banner are already in `ProductCatalog.tsx` — the partial-failure report reuses both, no new error infrastructure.
- The single `pending` boolean currently gates the form modal, the single-delete dialog, and (after this change) the bulk bar. Bulk progress needs its own state so it doesn't entangle with the add/edit modal — see Critical Implementation Details.

## Desired End State

On `/products`, each product row has a checkbox and the list header has a "select all" checkbox. Selecting ≥1 product reveals a bulk-action bar showing the selection count, a **Delete selected** button, and a **Clear selection** button. Delete opens a count-aware confirmation; confirming runs a sequential delete that shows "Deleting N of M…", removes each succeeded product from the list, and — if any fail — leaves the failed products selected and shows a banner naming them. "Clear selection" empties the selection and hides the bar. On `/dashboard`, generating a restocking plan shows a skeleton placeholder in the list area while the request is in flight.

Verification: select 3 of 5 products → bar shows "3 selected" → Delete → confirm → list loses the 3 rows; with a forced failure on one id, that row remains and the banner names it. Clear selection hides the bar. Restocking "Generate" shows a skeleton, then the plan.

## What We're NOT Doing

- **No new API routes** and **no bulk endpoint** — the loop reuses `DELETE /api/products/[id]`.
- **No changes to `src/lib/db.ts`** — avoids the S-07 merge conflict. No new DB helper of any kind.
- **No bulk delete on the sales-entries list** (`ProductDetail.tsx`) — deferred to backlog; that endpoint has a different (classification-returning) shape.
- **No bulk actions on restocking candidates** — they are read-only with no mutation endpoint; out of scope.
- **No restocking "clear plan" button** — "session reset" is scoped to the catalog selection only.
- **No reusable Spinner/Skeleton in `ui/`** — loading states use ad-hoc `Loader2` / lightweight skeleton markup, matching the current idiom. (Extracting a shared component is a backlog item.)
- **No schema, classification-engine, or recommendation changes.**
- **No toast library** — inline banners only.

## Implementation Approach

Build incrementally on the existing catalog island. Phase 1 introduces selection state and the controls (including the "reset" / clear-selection action) with the Delete button inert, so the selection UX is verifiable on its own. Phase 2 wires the Delete button to the sequential loop with progress and partial-failure reporting. Phase 3 is an independent dashboard tweak (restocking skeleton) with no dependency on Phases 1–2. Each phase is separately verifiable and separately shippable.

## Critical Implementation Details

- **Separate the bulk progress state from the existing `pending`.** `pending` already gates the add/edit form modal and the single-delete dialog. Reusing it for the bulk loop would cross-disable unrelated UI. Introduce dedicated bulk state (e.g. `bulkDeleting: boolean` plus a `{ done, total }` progress counter); leave `pending` for the existing single-item flows.
- **204 has no body.** In the loop, treat `res.ok` as success and do not call `res.json()` on the success path; only read the body via `readError` on `!res.ok`. A `try/catch` around each `fetch` maps network errors to a failure for that id (same shape as the existing `handleDelete` catch).
- **Selection must stay consistent with the list.** When a product is deleted (single or bulk) its id must also be removed from `selectedIds`, and any product removed by edit/add flows should not leave a dangling selected id. Derive the "select all" checked/indeterminate state from `selectedIds` vs the current `products`.

## Phase 1: Selection UI + clear-selection ("reset")

### Overview

Add multi-select to the catalog: per-row checkboxes, a header select-all checkbox, and a bulk-action bar that appears when ≥1 product is selected. The bar hosts a **Delete selected** button (inert in this phase) and a **Clear selection** button (the "reset a review session" gap). No deletion logic yet — this phase is about the selection experience.

### Changes Required:

#### 1. Install the checkbox primitive

**File**: `src/components/ui/checkbox.tsx` (new, generated)

**Intent**: Provide the shadcn `Checkbox` component the selection UI needs; it is not yet installed.

**Contract**: Run `npx shadcn@latest add checkbox`. Produces `src/components/ui/checkbox.tsx` (Radix `CheckboxPrimitive`, "new-york" variant). No manual edits expected beyond what the generator emits.

#### 2. Add a type-check npm script

**File**: `package.json`

**Intent**: Give the automated verification a real type-check gate. `npm run build` (`astro build`) does NOT run `astro check`; ESLint's `projectService` provides type-aware lint rules but not `tsc` type-checking. `@astrojs/check` is already a dependency.

**Contract**: Add `"typecheck": "astro check"` to the `scripts` block. All phases' Automated Verification reference `npm run typecheck` for type checking.

#### 3. Selection state + controls in the catalog island

**File**: `src/components/products/ProductCatalog.tsx`

**Intent**: Track which products are selected, render checkboxes per row and a select-all checkbox in a list header, and show a bulk-action bar with selection count, an (inert) Delete-selected button, and a Clear-selection button.

**Contract**:
- New state `selectedIds: Set<string>` (of `product.id`). Helpers to toggle one id, toggle-all (select all currently shown vs clear), and `clearSelection()`.
- Each row (`ProductCatalog.tsx:154`) gains a leading `Checkbox` bound to `selectedIds.has(product.id)`; clicking the row's checkbox toggles membership. The existing row link and Edit/Delete icon buttons remain.
- A header row above the list carries a select-all `Checkbox`: checked when all shown products are selected, indeterminate when some are, unchecked when none.
- A bulk-action bar renders only when `selectedIds.size > 0`: shows "{n} selected", a **Delete selected** button (destructive variant; `onClick` is a no-op/disabled in this phase), and a **Clear selection** button (ghost/outline) wired to `clearSelection()`.
- Keep selection consistent: when `products` changes (add/edit/delete), prune ids no longer present from `selectedIds`.
- Use `cn()` for conditional classes; match the existing dark-theme styling (`border-white/10`, `bg-white/5`, etc.).

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run typecheck` (runs `astro check`)
- Build passes: `npm run build`
- Linting passes: `npm run lint`
- `src/components/ui/checkbox.tsx` exists.

#### Manual Verification:

- Each product row shows a checkbox; toggling it selects/deselects that product.
- The select-all checkbox selects all rows; when partially selected it shows the indeterminate state; toggling it off clears.
- The bulk-action bar appears only when ≥1 product is selected and shows the correct count.
- "Clear selection" empties the selection and hides the bar.
- Add/edit/single-delete still work and don't leave stale selection state.

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding.

---

## Phase 2: Bulk-delete (sequential loop, progress, partial-failure reporting)

### Overview

Wire the **Delete selected** button to a count-aware confirmation and a sequential client-side loop over `DELETE /api/products/[id]`. Show "Deleting N of M…" progress, remove each succeeded product from the list, and on partial failure keep the failed products selected and name them in the existing inline banner.

### Changes Required:

#### 1. Count-aware bulk confirmation dialog

**File**: `src/components/products/BulkDeleteDialog.tsx` (new)

**Intent**: Confirm deletion of multiple products, mirroring `DeleteProductDialog` but for a count rather than a single name, with the same cascade warning.

**Contract**: Props `{ open: boolean; count: number; pending: boolean; onConfirm: () => void; onCancel: () => void }`. **`open` must be driven by a dedicated boolean the parent sets when "Delete selected" is clicked** — NOT by `count > 0` (that is the bulk-bar-visible condition; binding `open` to it would pop the dialog open the instant a product is checked). `count` (= `selectedIds.size`) is used only for the title/description text (e.g. "Delete N products?"), which repeats the "permanently removes the products and all of their sales entries" warning. Destructive confirm button shows progress text while `pending`. Reuse the `Dialog`/`Button` styling from `DeleteProductDialog.tsx`.

#### 2. Sequential bulk-delete handler in the catalog island

**File**: `src/components/products/ProductCatalog.tsx`

**Intent**: Run the selected ids through `DELETE /api/products/[id]` one at a time, tracking progress and per-item outcome, updating the list and selection as results come in, and reporting any failures.

**Contract**:
- New state for the bulk flow distinct from `pending`: a `bulkDeleting: boolean` and a progress counter (e.g. `{ done, total }`); a confirmation-open boolean.
- Before the loop, snapshot `{ id, name }` for each selected product (the list is mutated as deletes succeed). Build the partial-failure banner message from this snapshot so failed product names are resolved reliably, not from the mid-iteration `products` array.
- `handleBulkDelete()`: snapshot the selected ids; set `bulkDeleting`; loop **sequentially** (`for … of` with `await`) calling `fetch(`/api/products/${id}`, { method: "DELETE" })`. On `res.ok` (204) → mark succeeded, increment progress, remove the product from `products` and the id from `selectedIds`. On `!res.ok` → record the failure with `await readError(res, …)`; on thrown network error → record a network failure for that id. Do **not** parse JSON on the success path.
- After the loop: failed ids remain in `selectedIds`; if any failed, set `listError` to a message naming the failed product(s) (reuse the existing banner). Clear `bulkDeleting` and progress in a `finally`.
- The bulk-action bar's Delete button opens the confirmation; the confirm action invokes `handleBulkDelete()`. While `bulkDeleting`, the bar/buttons are disabled and show "Deleting {done} of {total}…".

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run typecheck` (runs `astro check`)
- Build passes: `npm run build`
- Linting passes: `npm run lint`

#### Manual Verification:

- Selecting N products and confirming deletes them: all N rows disappear and the bar hides.
- During deletion the bar is disabled and shows "Deleting N of M…" progress.
- Forcing a failure on one id (e.g. offline, or a deleted-elsewhere id returning 404) leaves that product's row present and still selected; the banner names the failed product; succeeded rows are gone.
- Re-confirming after a partial failure retries only the still-selected (failed) products.
- Single-delete, add, and edit flows are unaffected.

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding.

---

## Phase 3: Restocking plan loading skeleton

### Overview

Give the restocking-plan candidate list a visible loading state. Today only the Generate button shows a spinner; the list area stays empty until the response arrives. Add a skeleton placeholder while `POST /api/restocking-plan` is in flight.

### Changes Required:

#### 1. Skeleton placeholder while generating

**File**: `src/components/dashboard/RestockingPlan.tsx`

**Intent**: While `pending`, render a lightweight skeleton in the list area (a few placeholder rows shaped like the candidate items) so the in-flight state is legible beyond the button spinner.

**Contract**: When `pending` is true, render a small set of placeholder rows (pulsing `bg-white/5`/`bg-white/10` blocks via `animate-pulse`, matching the existing candidate-row layout at `RestockingPlan.tsx:94–109`) in place of / above the plan area. Keep the existing button spinner. No new shared component — inline skeleton markup with `cn()`, consistent with the dark theme. Ensure the skeleton does not flash alongside a stale `plan` (clear or visually replace the prior plan while pending).

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run typecheck` (runs `astro check`)
- Build passes: `npm run build`
- Linting passes: `npm run lint`

#### Manual Verification:

- Clicking "Generate weekly restocking plan" shows a skeleton placeholder in the list area while the request is in flight, then the skeleton is replaced by the plan (or the empty/fallback state).
- The error path still shows the inline error banner; no skeleton lingers after an error.

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation.

---

## Testing Strategy

### Manual Testing Steps:

1. **Selection (Phase 1)**: On `/products` with ≥3 products, toggle individual checkboxes, toggle select-all (verify indeterminate state), and confirm the bulk bar's count. Click "Clear selection" and confirm the bar hides.
2. **Bulk delete happy path (Phase 2)**: Select several products, Delete selected, confirm — verify rows disappear, progress text shows, bar hides.
3. **Bulk delete partial failure (Phase 2)**: Force one delete to fail (e.g. go offline mid-run, or delete a product in another tab first so its id 404s), confirm the failed row stays selected and is named in the banner while the others are removed; re-confirm retries only failures.
4. **Regression (Phase 2)**: Single-delete, add, and edit still work.
5. **Restocking skeleton (Phase 3)**: On `/dashboard`, click Generate and confirm a skeleton appears during the fetch, replaced by the plan/empty/fallback; trigger an error and confirm the banner shows with no lingering skeleton.

### Edge Cases:

- Select-all then delete-all → empty-state ("No products yet") renders correctly.
- A product deleted in another tab (stale id) → its bulk delete returns 404 and is reported as a failure, not a silent success.
- Rapidly toggling selection during a bulk delete is prevented by the disabled bar.

## Performance Considerations

Sequential deletes are O(N) round-trips; acceptable at MVP catalog sizes and chosen deliberately to enable "N of M" progress and per-item error attribution. No change to query patterns or server load beyond the same per-id DELETE already in use.

## Migration Notes

None — no schema or data changes.

## References

- Roadmap slice: `context/foundation/roadmap.md` (S-06)
- Catalog island: `src/components/products/ProductCatalog.tsx:89` (single-delete pattern to generalize)
- Single-delete dialog to mirror: `src/components/products/DeleteProductDialog.tsx`
- DELETE endpoint (unchanged, 204 on success): `src/pages/api/products/[id].ts`
- Restocking island: `src/components/dashboard/RestockingPlan.tsx:62`
- Lesson (DB-boundary try/catch — not triggered here since no new endpoints/helpers): `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Selection UI + clear-selection ("reset")

#### Automated

- [x] 1.1 Type checking passes: `npm run typecheck`
- [x] 1.2 Build passes: `npm run build`
- [x] 1.3 Linting passes: `npm run lint`
- [x] 1.4 `src/components/ui/checkbox.tsx` exists

#### Manual

- [x] 1.5 Per-row checkbox toggles selection
- [x] 1.6 Select-all checkbox works incl. indeterminate state
- [x] 1.7 Bulk-action bar appears only when ≥1 selected and shows correct count
- [x] 1.8 "Clear selection" empties selection and hides the bar
- [x] 1.9 Add/edit/single-delete unaffected; no stale selection state

### Phase 2: Bulk-delete (sequential loop, progress, partial-failure reporting)

#### Automated

- [ ] 2.1 Type checking passes: `npm run typecheck`
- [ ] 2.2 Build passes: `npm run build`
- [ ] 2.3 Linting passes: `npm run lint`

#### Manual

- [ ] 2.4 Selecting N and confirming deletes all N; bar hides
- [ ] 2.5 Bar disabled and shows "Deleting N of M…" during the loop
- [ ] 2.6 Forced single failure: failed row stays selected and is named in the banner; succeeded rows removed
- [ ] 2.7 Re-confirm retries only the still-selected (failed) products
- [ ] 2.8 Single-delete, add, edit unaffected

### Phase 3: Restocking plan loading skeleton

#### Automated

- [ ] 3.1 Type checking passes: `npm run typecheck`
- [ ] 3.2 Build passes: `npm run build`
- [ ] 3.3 Linting passes: `npm run lint`

#### Manual

- [ ] 3.4 Generate shows a skeleton while in flight, replaced by plan/empty/fallback
- [ ] 3.5 Error path shows the banner with no lingering skeleton
