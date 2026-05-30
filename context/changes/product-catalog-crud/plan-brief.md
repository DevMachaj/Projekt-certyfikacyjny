# Product Catalog CRUD (S-01) — Plan Brief

> Full plan: `context/changes/product-catalog-crud/plan.md`

## What & Why

S-01 lets a store owner add, edit, and delete products (name, stock quantity, lead time,
buffer days) in their catalog, with changes reflected immediately and strict per-account
isolation. It's the first user-facing slice on top of the F-01 data layer, and it introduces
the project's first domain API routes and first JSON-fetch React island — the patterns S-02
(sales entry + classification) and S-03 (dashboard) will reuse. Without a product to manage,
none of the classification value can be demonstrated.

## Starting Point

The `products` table, RLS policies, and `Product` type are already in place from F-01, and the
`sales_entries → products` foreign key has `ON DELETE CASCADE` — so the roadmap's flagged
cascade-delete risk is already handled at the database level. `src/lib/db.ts` has a read helper
to extend. Auth, SSR client, and middleware route-guarding all work. No `/products` page exists
and `zod` is not yet installed.

## Desired End State

A logged-in owner opens `/products` and sees their catalog (or an "add your first product" CTA).
They add and edit products through a modal form, and delete via a confirmation modal that warns
about sales-entry removal. Every change appears in the list immediately without a full reload,
and no account can ever see another's products.

## Key Decisions Made

| Decision           | Choice                                  | Why (1 sentence)                                                                             | Source   |
| ------------------ | --------------------------------------- | -------------------------------------------------------------------------------------------- | -------- |
| UI architecture    | React island + JSON API                 | True in-place "reflected immediately" updates and the natural base for S-02's 1s refresh.    | Plan     |
| Input validation   | Add `zod` + shared `productSchema`      | Honors CLAUDE.md's mandate; one source of truth for client + server rules.                   | Plan     |
| Edit UX            | Modal dialog (shared add/edit form)     | One form to build/validate; keeps the owner on the list with full context.                   | Plan     |
| Delete UX          | In-app confirmation modal               | Can state the sales-entry cascade consequence explicitly and stay on-theme.                  | Plan     |
| Catalog location   | New `/products` page + nav link         | Clean slice boundary — S-03 owns `/dashboard`; no rework later.                              | Plan     |
| Empty/error states | Empty-state CTA + inline error feedback | Demo-ready for the market-feedback goal; no silent failures; lightweight (no toast library). | Plan     |
| Cascade delete     | Rely on DB `ON DELETE CASCADE` (F-01)   | Already enforced in schema; no app-layer cascade code needed.                                | Research |

## Scope

**In scope:**

- `zod` dependency + shared `src/lib/validation/product.ts` schema
- Write helpers in `src/lib/db.ts` (create/update/delete)
- JSON API routes: `/api/products` (GET, POST), `/api/products/[id]` (PATCH, DELETE)
- `/products` page + `ProductCatalog` island (list, add/edit modal, delete-confirm modal, empty state, inline errors)
- shadcn `dialog` primitive; `/products` added to `PROTECTED_ROUTES`; nav link

**Out of scope:**

- Sales entries, velocity, classification (S-02); dashboard grouped view (S-03)
- DB migrations (F-01 schema is sufficient); auth-flow changes
- Pagination/search/sort; toast library; undo/soft-delete

## Architecture / Approach

Server-first. Phase 1 builds the validated JSON API + DB write helpers, verifiable via curl and
`npm run build` with no UI. Phase 2 builds the `/products` page (SSR fetch of `initialProducts`)
hydrating a `ProductCatalog` island that does CRUD via `fetch` and mutates state in place. A
single zod `productSchema` is shared by the API handler and the island so validation semantics
match on both sides. Ownership is enforced by RLS — handlers set `user_id` from `locals.user`
and never trust client input.

## Phases at a Glance

| Phase                             | What it delivers                                         | Key risk                                                          |
| --------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------- |
| 1. Data access + validation + API | zod schema, db write helpers, products JSON API routes   | Nullable `lead_time_days` mishandled (empty → `0` violates CHECK) |
| 2. Catalog page + React island UI | `/products` page, list, add/edit + delete modals, states | Island state drift from server; missing route guard exposes page  |

**Prerequisites:** F-01 done (it is); local Supabase runnable (`npx supabase start`, Docker).
**Estimated effort:** ~1–2 sessions across 2 phases.

## Open Risks & Assumptions

- `lead_time_days` is nullable (FR-007 "if lead time is not set"): the form/schema must coerce an
  empty input to `null`, never `0` (which would violate the DB CHECK and misrepresent intent).
- No test framework is configured; verification is build/lint + manual testing, by design.
- Cascade delete is assumed correct from F-01 and is re-verified manually, not re-implemented.

## Success Criteria (Summary)

- Owner can add, edit, and delete products on `/products`, each change visible immediately.
- An owner never sees another account's products; deleting a product removes its sales entries.
- `npm run build`, `npm run lint`, and `npm run format` all pass.
