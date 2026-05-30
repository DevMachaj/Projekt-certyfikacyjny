# Supabase Schema and Domain Types Implementation Plan

## Overview

Create the `products` and `sales_entries` tables in Supabase with per-operation RLS policies enforcing per-user data isolation, declare TypeScript domain entity types in `src/types.ts`, and establish typed Supabase query helpers in `src/lib/db.ts` as the convention downstream slices (S-01, S-02, S-03) will follow.

## Current State Analysis

No domain schema, types, or query patterns exist. The Supabase SSR client is operational (`src/lib/supabase.ts`) and `src/middleware.ts` already attaches `locals.user` from auth — RLS policies will resolve the authenticated user's JWT automatically via `auth.uid()`. `src/types.ts` does not exist. `supabase/migrations/` directory does not exist.

## Desired End State

After this plan is complete:
- `products` and `sales_entries` tables exist in Supabase with correct columns, CHECK constraints, and per-operation RLS policies
- `npx supabase db reset` applies both migrations cleanly against a local Supabase instance
- `src/types.ts` exports `Product`, `SalesEntry`, and `ClassificationState`
- `src/lib/db.ts` exports two typed query helpers (`getProductsByUser`, `getSalesEntriesByProduct`) establishing the pattern for S-01/S-02/S-03
- `npm run build` and `npm run lint` both pass with no errors

### Key Discoveries:

- `src/lib/supabase.ts` creates the Supabase SSR client; domain queries go in `src/lib/db.ts`, not here
- CLAUDE.md mandates migration naming `YYYYMMDDHHmmss_short_description.sql` and "granular per-operation, per-role policies"
- `supabase/config.toml` has migrations enabled; files in `supabase/migrations/` are auto-picked by `supabase db reset` — no `schema_paths` change needed
- The `sales_entries` INSERT policy must verify the referenced `product_id` belongs to `auth.uid()` (not just that `user_id = auth.uid()`) to prevent cross-user product association
- `lead_time_days` is nullable — FR-007 explicitly states "if lead time is not set, show 'Set lead time to get reorder suggestion'"

## What We're NOT Doing

- No domain API routes (belong to S-01, S-02)
- No UI changes
- No Supabase type generation (`supabase gen types`) — manual types chosen for Cloudflare Workers build compatibility
- No `ProductWithClassification` computed type — belongs in S-02 where the classification logic lives
- No additional indexes beyond PKs — deferred until S-01/S-02 reveal actual query patterns
- No changes to `src/lib/supabase.ts` (already correct) or `src/env.d.ts` (auth types already declared)

## Implementation Approach

Three sequential phases: schema first (establishes the DB contract everything else depends on), types second (locks the TypeScript representation to match that schema), reference patterns third (establishes the query convention). Each phase is independently verifiable before the next begins.

## Critical Implementation Details

**INSERT policy for `sales_entries`**: The `WITH CHECK` clause on the INSERT policy must include both `auth.uid() = user_id` AND an EXISTS subquery verifying `product_id` references a product whose `user_id = auth.uid()`. Without the second check, a user can attach sales entries to another user's product — a data isolation violation under NFR-003.

---

## Phase 1: Database Schema

### Overview

Create two SQL migration files defining `products` and `sales_entries` with all constraints and per-operation RLS policies.

### Changes Required:

#### 1. Products table migration

**File**: `supabase/migrations/20260530000001_create_products.sql`

**Intent**: Create the `products` table with all columns required by FR-003, CHECK constraints on all numeric fields, FK cascade to `auth.users`, and four separate RLS policies (one per operation).

**Contract**: Columns: `id uuid PK`, `user_id uuid NOT NULL FK→auth.users ON DELETE CASCADE`, `name text NOT NULL`, `stock_quantity integer NOT NULL CHECK (≥ 0)`, `lead_time_days integer nullable CHECK (> 0 when set)`, `buffer_days integer NOT NULL DEFAULT 7 CHECK (> 0)`, `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz NOT NULL DEFAULT now()`. RLS enabled. Policies `products_select`, `products_insert`, `products_update`, `products_delete` — each using `auth.uid() = user_id`; UPDATE includes both USING and WITH CHECK.

#### 2. Sales entries table migration

**File**: `supabase/migrations/20260530000002_create_sales_entries.sql`

**Intent**: Create the `sales_entries` table with columns from FR-005, a `start_before_end` table constraint, `ON DELETE CASCADE` to products (FR-011), and four RLS policies — with the INSERT policy including a product-ownership verification.

**Contract**: Columns: `id uuid PK`, `product_id uuid NOT NULL FK→public.products(id) ON DELETE CASCADE`, `user_id uuid NOT NULL FK→auth.users(id) ON DELETE CASCADE`, `units_sold integer NOT NULL CHECK (> 0)`, `start_date date NOT NULL`, `end_date date NOT NULL`, `created_at timestamptz NOT NULL DEFAULT now()`. Table constraint: `start_before_end CHECK (end_date >= start_date)`. RLS enabled. Policies `sales_entries_select`, `sales_entries_update`, `sales_entries_delete` use `USING (auth.uid() = user_id)`. Policy `sales_entries_insert` uses `WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.products WHERE products.id = product_id AND products.user_id = auth.uid()))`.

### Success Criteria:

#### Automated Verification:

- Migrations apply cleanly: `npx supabase db reset` completes without errors
- Build passes: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification:

- Both tables visible in Supabase Studio with correct column types
- CHECK constraints visible on `stock_quantity`, `units_sold`, `lead_time_days`, `buffer_days`
- `start_before_end` table constraint visible on `sales_entries`
- `start_date` and `end_date` column types shown as `date` (not `timestamp`)
- RLS enabled indicator shown for both tables
- 4 policies per table with correct operation labels (SELECT / INSERT / UPDATE / DELETE)
- `buffer_days` default of 7 confirmed in the `products` column definition

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation that Supabase Studio matches the expected schema before proceeding to Phase 2.

---

## Phase 2: TypeScript Domain Types

### Overview

Create `src/types.ts` with domain entity types that mirror the schema from Phase 1 exactly.

### Changes Required:

#### 1. Domain entity types

**File**: `src/types.ts` (new file)

**Intent**: Declare the canonical TypeScript shapes for `Product`, `SalesEntry`, and `ClassificationState`. These types are the single source of truth for all downstream slices — a mismatch here propagates as a type error across S-01, S-02, S-03.

**Contract**: Export `ClassificationState` as a union: `'Understocked' | 'Watch' | 'OK' | 'Slow-mover' | 'Insufficient data'`. Export `Product` interface with: `id: string`, `user_id: string`, `name: string`, `stock_quantity: number`, `lead_time_days: number | null`, `buffer_days: number`, `created_at: string`, `updated_at: string`. Export `SalesEntry` interface with: `id: string`, `product_id: string`, `user_id: string`, `units_sold: number`, `start_date: string`, `end_date: string`, `created_at: string`. Date fields are `string` because Supabase returns Postgres `date` columns as ISO date strings (`"YYYY-MM-DD"`).

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Build passes: `npm run build` — no TypeScript errors referencing types from `@/types`

#### Manual Verification:

- Each `Product` field matches the corresponding column in `20260530000001_create_products.sql`
- Each `SalesEntry` field matches the corresponding column in `20260530000002_create_sales_entries.sql`
- `lead_time_days` is `number | null` (not `number`)
- `start_date` and `end_date` are `string` (not `Date`)

**Implementation Note**: After completing this phase, confirm the type fields match the migration columns manually before proceeding to Phase 3.

---

## Phase 3: Reference Query Patterns

### Overview

Create `src/lib/db.ts` with two typed query helpers establishing the convention downstream slices follow when querying domain data through the Supabase client.

### Changes Required:

#### 1. Typed query helper module

**File**: `src/lib/db.ts` (new file)

**Intent**: Establish the query pattern: accept a `SupabaseClient` instance (SSR-compatible, matches the return type of `createClient` in `src/lib/supabase.ts`), call `.from('table').select('*')` with filters, cast to the domain type, and throw on Supabase error. This is the pattern S-01, S-02, S-03 copy for their own queries.

**Contract**: Export `getProductsByUser(supabase: SupabaseClient, userId: string): Promise<Product[]>` — selects from `products` where `user_id = userId`, ordered by `name` ascending. Export `getSalesEntriesByProduct(supabase: SupabaseClient, productId: string): Promise<SalesEntry[]>` — selects from `sales_entries` where `product_id = productId`, ordered by `start_date` ascending. Both functions throw the Supabase error object on failure (no silent null returns). Import `SupabaseClient` from `@supabase/supabase-js`; import `Product` and `SalesEntry` from `@/types`.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Build passes: `npm run build` — no TypeScript errors in `src/lib/db.ts`

#### Manual Verification:

- Both functions importable from `@/lib/db` in a consuming file
- Function signatures accept the `SupabaseClient` returned by `createClient` in `src/lib/supabase.ts` without type errors
- No circular imports between `src/lib/db.ts` and `src/lib/supabase.ts`

---

## Testing Strategy

### Unit Tests:

- None at MVP — no test runner is configured in this project.

### Manual Testing Steps:

1. Run `npx supabase start` (requires Docker) to start local Supabase instance
2. Run `npx supabase db reset` to apply migrations; confirm no errors in output
3. Open Supabase Studio (typically `http://localhost:54323`); navigate to Table Editor
4. Verify `products` table: 8 columns, correct types, `buffer_days` default = 7, `lead_time_days` nullable
5. Verify `sales_entries` table: 7 columns, `start_date`/`end_date` shown as `date` type, `start_before_end` constraint present
6. Navigate to Authentication → Policies; verify 4 policies per table with correct operation labels
7. Run `npm run build` from the project root; confirm TypeScript compilation succeeds
8. Run `npm run lint`; confirm no lint errors

## Performance Considerations

No performance concerns at MVP scale. Index optimization deferred to S-01/S-02 where actual query patterns are established.

## Migration Notes

`supabase/migrations/` does not exist — create the directory before adding migration files. Migration naming follows CLAUDE.md: `YYYYMMDDHHmmss_short_description.sql`. No changes to `supabase/config.toml` are needed.

## References

- PRD: `context/foundation/prd.md` — FR-003 (product fields), FR-005 (sales entry fields), FR-007 (lead time nullable), NFR-003 (data isolation)
- Roadmap: `context/foundation/roadmap.md` — F-01 entry and risk note on schema propagation
- Auth client pattern: `src/lib/supabase.ts` — SSR client that `src/lib/db.ts` must be compatible with

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Database Schema

#### Automated

- [x] 1.1 Migrations apply cleanly: `npx supabase db reset` — 0d5f69e
- [x] 1.2 Build passes: `npm run build` — 0d5f69e
- [x] 1.3 Lint passes: `npm run lint` — 0d5f69e

#### Manual

- [ ] 1.4 Both tables visible in Supabase Studio with correct column types
- [ ] 1.5 CHECK constraints visible on numeric fields
- [ ] 1.6 `start_before_end` constraint visible on `sales_entries`
- [ ] 1.7 `start_date`/`end_date` shown as `date` type (not timestamp)
- [ ] 1.8 RLS enabled on both tables
- [ ] 1.9 4 policies per table with correct operation labels
- [ ] 1.10 `buffer_days` default of 7 confirmed in column definition

### Phase 2: TypeScript Domain Types

#### Automated

- [x] 2.1 Lint passes: `npm run lint` — bec03c4
- [x] 2.2 Build passes: `npm run build` — bec03c4

#### Manual

- [ ] 2.3 Each `Product` field matches the products migration column
- [ ] 2.4 Each `SalesEntry` field matches the sales_entries migration column
- [ ] 2.5 `lead_time_days` typed as `number | null`
- [ ] 2.6 Date fields typed as `string`

### Phase 3: Reference Query Patterns

#### Automated

- [x] 3.1 Lint passes: `npm run lint` — 0190d29
- [x] 3.2 Build passes: `npm run build` — 0190d29

#### Manual

- [ ] 3.3 Both functions importable from `@/lib/db`
- [ ] 3.4 No type errors when passing SSR client from `supabase.ts`
- [ ] 3.5 No circular imports between `db.ts` and `supabase.ts`
