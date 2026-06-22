<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Account Deletion and Data Retention (S-07)

- **Plan**: context/changes/account-deletion-and-data-retention/plan.md
- **Mode**: Deep
- **Date**: 2026-06-22
- **Verdict**: REVISE
- **Findings**: 1 critical, 2 warnings, 0 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | FAIL    |
| Plan Completeness     | WARNING |

## Grounding

6/6 paths ✓, 2/2 symbols ✓, brief↔plan ✓. Blast radius clean — plan adds `createAdminClient` rather than modifying the heavily-imported `createClient`. `readError` already inline-duplicated across 3 islands (inline-copy is the established convention). Existing code guards `user?.email` (dashboard.astro:44), confirming nullability.

## Findings

### F1 — deleteUser returns an {error} object; "try/catch → 500" misses it

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 2 — API route, step 4
- **Detail**: The plan says "Call deleteUser inside try/catch; on error return 500." supabase-js admin methods do NOT throw on API errors — they return `{ data, error }`, throwing only on network failure. With an invalid (not missing) service-role key, GoTrue returns a 401 in the returned `error` object, not an exception. A try/catch-only implementation never sees it, falls through to success, calls signOut, returns 200 — UI redirects to `/` as if deleted when nothing was deleted. Violates the plan's Desired End State ("service-role key missing/invalid … see an inline error and remain signed in"). Missing-key is handled (null client → 503); invalid-key is the gap.
- **Fix**: Specify that the route inspects the returned `{ error }` from deleteUser (and getUser) and maps a non-null error to a 500 `{ error }` response, with try/catch wrapping only the network-throw case. Both checks gate entry to the success branch; signOut + 200 happen only when error is null.
  - Strength: Closes the exact invalid-key failure path the plan promises; matches how supabase-js signals errors.
  - Tradeoff: None — contract clarification, a few lines.
  - Confidence: HIGH — supabase-js v2 admin/auth methods uniformly return error objects on API errors.
  - Blind spot: None significant.
- **Decision**: FIXED (Fix in plan)

### F2 — Post-delete signOut failure could 500 after an irreversible delete

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 2 — API route, step 5
- **Detail**: Step 5 says "On success, call signOut() then return 200" but never says what happens if signOut() fails. signOut runs against a session whose user was just deleted, so it can legitimately error. lessons.md pushes implementers to wrap every Supabase call in try/catch → 500, which here returns 500 *after* the account is irreversibly gone — UI shows an error and keeps the user on /account though the account no longer exists. Self-heals on next navigation (middleware getUser → null) but immediate UX is wrong.
- **Fix**: State that a successful deleteUser is the point of no return: signOut is best-effort — wrap it, swallow/log any error, always return 200 once the delete succeeded. Cookie clearing is not required for safety (token for a deleted user is inert; middleware getUser returns null).
  - Strength: Makes the success contract unambiguous; prevents a confusing post-delete 500.
  - Tradeoff: A lingering inert cookie if signOut fails — harmless, cleared next request cycle.
  - Confidence: HIGH — middleware re-resolves the user every request, so an orphaned token cannot authenticate.
  - Blind spot: Whether @supabase/ssr signOut clears cookies when the revoke call fails — unverified, moot given inert-token reasoning.
- **Decision**: FIXED (Fix in plan)

### F3 — user.email is string | undefined; type-checked lint will reject it

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 — account.astro / DeleteAccountDialog props
- **Detail**: Phase 3 passes `email={user.email}` into a prop typed `email: string` and uses it for the type-to-confirm match. Supabase User.email is `string | undefined`; existing code guards it as `user?.email` (dashboard.astro:44). `npm run lint` uses type-checked rules (CLAUDE.md), so passing the nullable value to a required string prop fails the automated check the plan relies on.
- **Fix**: Have account.astro resolve a definite string before passing it down (guard/fallback on user.email, consistent with existing user?.email usage), so the dialog always receives a non-null email.
- **Decision**: FIXED (Fix in plan)
