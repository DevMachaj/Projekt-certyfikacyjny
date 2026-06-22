# UX Improvements (S-06) — Plan Brief

> Full plan: `context/changes/ux-improvements/plan.md`

## What & Why

Close three friction points observed while building S-01 through S-05: bulk actions during catalog review (delete many products at once instead of one at a time), a "reset" control to clear a selection session, and clearer loading states. UI only — no schema, no engine changes, no new API routes.

## Starting Point

`/products` lists products with per-row edit/delete; single delete hits `DELETE /api/products/[id]` (204 on success) and optimistically filters the row. There is no multi-select and no shared loading component. shadcn `checkbox` is not yet installed. The restocking-plan island (`/dashboard`) shows only a button spinner while fetching — the list area stays blank.

## Desired End State

Catalog rows have checkboxes plus a select-all header; selecting ≥1 reveals a bulk-action bar (count, Delete selected, Clear selection). Bulk delete runs sequentially showing "Deleting N of M…", removes succeeded rows, and on partial failure keeps failed rows selected and names them in a banner. The restocking-plan list shows a skeleton while generating.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Bulk surface | Product catalog only | Matches the `DELETE /api/products/[id]` constraint; smallest coherent scope | Plan |
| Bulk-delete mechanism | Client-side sequential loop over existing endpoint | Avoids S-07 merge conflict; no new `db.ts` helper or bulk route | Plan (user constraint) |
| "Session reset" meaning | Clear-selection control | Pairs with bulk-select; pure client state | Plan |
| Partial-failure handling | Continue, then report failures | Maximizes work done; keeps failed rows selected for retry | Plan |
| Loop mode | Sequential (await each) | Enables "N of M" progress + per-item error attribution | Plan |
| Select UI | Always-visible checkboxes + action bar | Discoverable, single consistent mode | Plan |
| Loading-state surfaces | Bulk-delete progress + restocking skeleton | The two genuinely missing loading signals | Plan |

## Scope

**In scope:** catalog multi-select + select-all; clear-selection; count-aware bulk-delete confirm; sequential delete loop with progress + partial-failure banner; restocking-plan skeleton; installing shadcn `checkbox`.

**Out of scope:** any new API route or bulk endpoint; any `src/lib/db.ts` change; sales-entry bulk delete; restocking-candidate actions / "clear plan"; a reusable Spinner/Skeleton component; schema/engine changes; toast library.

## Architecture / Approach

All work lives in two existing React islands. `ProductCatalog.tsx` gains `selectedIds: Set<string>`, checkbox UI, a bulk-action bar, a new count-aware `BulkDeleteDialog`, and a sequential `handleBulkDelete` that reuses the existing `readError` + inline-banner pattern. Bulk progress uses state distinct from the existing `pending` so it doesn't cross-disable the add/edit modal. `RestockingPlan.tsx` adds an inline `animate-pulse` skeleton while `pending`. No server-side or data-layer changes.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Selection UI + clear-selection | Checkboxes, select-all, bulk bar, Clear selection (Delete inert) | Keeping `selectedIds` consistent as the list mutates |
| 2. Bulk-delete loop | Sequential delete, "N of M" progress, partial-failure banner | 204 has no body; don't parse JSON on success; separate bulk state from `pending` |
| 3. Restocking skeleton | Skeleton placeholder while plan generates | Skeleton flashing alongside a stale plan |

**Prerequisites:** F-01 (done). Independent of the S-04/S-05 restocking core and of S-07.
**Estimated effort:** ~1–2 sessions across 3 phases; Phase 3 is independent of 1–2.

## Open Risks & Assumptions

- Sequential deletes are O(N) round-trips — accepted deliberately for progress + error attribution; fine at MVP catalog sizes.
- "Scope creep" is the named S-06 risk; the In/Out lists above fix the action set to the three observed gaps.
- The DB-boundary try/catch lesson does not apply (no new endpoints/helpers touched).

## Success Criteria (Summary)

- Owner can select multiple products and delete them in one confirmed action, with visible progress and a clear report of any failures.
- Owner can clear a selection to start the review over.
- The restocking-plan list shows a loading skeleton while generating instead of a blank area.
