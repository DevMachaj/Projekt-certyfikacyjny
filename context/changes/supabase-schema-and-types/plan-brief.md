# Supabase Schema and Domain Types — Plan Brief

> Full plan: `context/changes/supabase-schema-and-types/plan.md`

## What & Why

F-01 lays the data foundation that every subsequent roadmap slice depends on. Without the `products` and `sales_entries` tables in place — with correct columns, RLS, and TypeScript types — S-01 (product CRUD), S-02 (classification engine), and S-03 (dashboard) cannot begin. The risk identified in the roadmap is directional: schema mistakes propagate to all three downstream slices; fixing them post-hoc requires a migration plus a type refactor across the entire codebase.

## Starting Point

The Supabase SSR client is wired (`src/lib/supabase.ts`), auth middleware attaches `locals.user`, and auth routes work end-to-end. No domain schema exists: `supabase/migrations/` is absent, `src/types.ts` doesn't exist, and there are zero domain routes or entity references anywhere in `src/`.

## Desired End State

Both tables live in Supabase, protected by per-operation RLS policies so each owner's data is strictly isolated. TypeScript interfaces for `Product`, `SalesEntry`, and `ClassificationState` are declared in `src/types.ts`. Two typed query helpers in `src/lib/db.ts` show the pattern S-01/S-02/S-03 will copy. `npm run build` and `npm run lint` pass cleanly.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Date column type | `DATE` (not TIMESTAMPTZ) | PRD's velocity formula uses calendar days; no intra-day precision needed |
| `lead_time_days` nullability | Nullable, no default | FR-007 explicitly supports "if lead time is not set" as a valid product state |
| Cascade delete | DB-level `ON DELETE CASCADE` | Enforced at DB level so API bugs can't leave orphaned sales entries |
| Numeric CHECK constraints | Yes — on all numeric fields | Prevents corrupted velocity inputs (0 or negative values) at the source |
| RLS policy structure | Per-operation (4 per table) | CLAUDE.md mandates granular per-operation policies; independently auditable |
| TypeScript types | Manual `interface` types | No Supabase CLI dependency at build time; compatible with Cloudflare Workers CI |
| `buffer_days` default | `DEFAULT 7` at DB level | Correct-by-default even if API omits the field; matches PRD "default: 7" |

## Scope

**In scope:**
- `supabase/migrations/20260530000001_create_products.sql`
- `supabase/migrations/20260530000002_create_sales_entries.sql`
- `src/types.ts` — `Product`, `SalesEntry`, `ClassificationState`
- `src/lib/db.ts` — `getProductsByUser`, `getSalesEntriesByProduct`

**Out of scope:**
- Domain API routes (S-01, S-02)
- UI changes
- Computed types like `ProductWithClassification` (S-02)
- Database indexes (deferred to S-01/S-02)
- `supabase gen types` auto-generation

## Architecture / Approach

Schema-first: Phase 1 locks the DB contract, Phase 2 mirrors it in TypeScript, Phase 3 establishes the query convention. Each phase verifies independently (automated + Supabase Studio manual check) before the next begins. The `sales_entries` INSERT policy includes a product-ownership subquery (`EXISTS products WHERE user_id = auth.uid()`) to prevent cross-user data association — the key non-obvious RLS detail.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Database Schema | `products` + `sales_entries` tables, constraints, 8 RLS policies | Incorrect policy on `sales_entries` INSERT allows cross-user product association |
| 2. TypeScript Domain Types | `src/types.ts` with `Product`, `SalesEntry`, `ClassificationState` | Type field mismatch with schema propagates as errors in all downstream slices |
| 3. Reference Query Patterns | `src/lib/db.ts` with two typed query helpers | SSR client type incompatibility blocks S-01/S-02 from using the pattern |

**Prerequisites:** Docker installed (for `npx supabase start`); Supabase project credentials in `.dev.vars`  
**Estimated effort:** ~1 session across 3 phases (small changes; most time is schema design, already settled here)

## Open Risks & Assumptions

- Local Supabase must be runnable (`npx supabase start` requires Docker) — if Docker is unavailable, Phase 1 automated verification can only be tested against the remote project
- The overlap validation for `sales_entries` date ranges (FR-005) is **not** implemented in Phase 1 as a DB constraint — it is deferred to S-02 (application-layer check in the API handler), as the roadmap marked this as a planning-time decision

## Success Criteria (Summary)

- `npx supabase db reset` applies both migrations without errors; Supabase Studio shows correct schema and RLS policies
- `npm run build` and `npm run lint` pass after all three phases
- S-01 can begin implementation with `products` table and `Product` type available
