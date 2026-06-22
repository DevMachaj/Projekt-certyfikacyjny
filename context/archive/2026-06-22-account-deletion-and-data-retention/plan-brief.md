# Account Deletion and Data Retention (S-07) — Plan Brief

> Full plan: `context/changes/account-deletion-and-data-retention/plan.md`

## What & Why

Give an owner a way to permanently delete their account and all associated data. This is the end-of-lifecycle half of the per-user data-isolation contract (NFR-003) — the account can be created and used, but until now it could not be deleted. S-07 closes that gap with an immediate, irreversible hard delete.

## Starting Point

Auth, RLS, and the domain tables already exist. Critically, both `products.user_id` and `sales_entries.user_id` were declared `REFERENCES auth.users(id) ON DELETE CASCADE` back in F-01 — so deleting the `auth.users` row already wipes all of a user's data at the database level. What's missing is a privileged path to delete that row and a UI to trigger it.

## Desired End State

A signed-in owner visits `/account`, sees their email and a danger zone, types their email to confirm, and deletes their account. Their session is cleared and they land on `/`; their data is gone. If deletion fails, they see an inline error and stay signed in with data intact.

## Key Decisions Made

| Decision              | Choice                                              | Why (1 sentence)                                                              | Source |
| --------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------- | ------ |
| Retention model       | Immediate hard delete, no soft-delete window        | Resolves the roadmap's blocking product Unknown; simplest correct end state.  | Plan   |
| Cascade               | Rely on existing `ON DELETE CASCADE`, no app logic  | F-01 FKs already remove products + sales entries on auth-user delete.         | Plan   |
| Privileged client     | New null-guarded `createAdminClient()` (service-role)| `auth.admin.deleteUser` needs service-role; anon SSR client can't call it.    | Plan   |
| Confirmation friction | Type email to confirm                               | Strongest guard for an irreversible account-level action.                     | Plan   |
| Post-delete           | Clear session + redirect to `/`                     | Clean end-state, no orphaned session; mirrors the signout flow.               | Plan   |
| Failure behavior      | Return `{error}` JSON, keep session                 | Avoids half-deleted limbo; matches existing route + lessons.md contract.      | Plan   |
| Caller id             | Re-derive from `getUser()` server-side              | A user can only ever delete their own account; no IDOR surface.               | Plan   |
| Page scope            | `/account` danger-zone-only                         | Tightly scoped to S-07; no settings scope creep.                              | Plan   |

## Scope

**In scope:** service-role env secret + admin client factory; `DELETE /api/account`; `/account` route guard; `DeleteAccountDialog` + `AccountDangerZone` island; danger-zone `/account` page; dashboard link.

**Out of scope:** soft delete / retention window; data export; manual cascade; generalizing `DeleteProductDialog`; account-settings fields; `/goodbye` page; admin/other-user deletion.

## Architecture / Approach

`/account` page → `AccountDangerZone` island → `DELETE /api/account`. The route re-derives the caller id via the SSR client's `getUser()`, calls `auth.admin.deleteUser(id)` on a separate service-role admin client, then `signOut()`s the SSR session — and on success the island redirects to `/`. Postgres FKs cascade-delete `products` + `sales_entries`. Two clients live in one handler: the cookie SSR client for session read/teardown, the service-role client for the privileged delete.

## Phases at a Glance

| Phase                              | What it delivers                                          | Key risk                                                       |
| ---------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------- |
| 1. Config + admin client           | `SUPABASE_SERVICE_ROLE_KEY` + null-guarded admin factory  | Leaking the service-role key into the client bundle or repo.  |
| 2. API route + route guard         | `DELETE /api/account` + `/account` protected              | Wrong delete→signout ordering leaving a half-deleted state.   |
| 3. Dialog island + `/account` page | Type-email-to-confirm UI, inline errors, redirect to `/`  | Confirm guard or error display not wired correctly.           |

**Prerequisites:** F-01 cascade FKs (present); `SUPABASE_SERVICE_ROLE_KEY` provisioned in `.dev.vars` locally and as a Worker secret in prod.
**Estimated effort:** ~1 session across 3 phases.

## Open Risks & Assumptions

- The service-role key must be a Worker secret in production (`wrangler secret put`) — without it the feature degrades to a 503 rather than breaking other routes.
- Assumes the cascade FKs from F-01 are actually applied in the target database (true in migrations; verify in prod, where missing remote migrations have caused 500s before).
- Hard delete is irreversible by design — no recovery path is in scope.

## Success Criteria (Summary)

- A signed-in owner can delete their account; session is cleared, they land on `/`, and their `products` + `sales_entries` rows are gone.
- A failed deletion leaves the user signed in with data intact and shows an inline error.
- `/account` is unreachable while signed out.
