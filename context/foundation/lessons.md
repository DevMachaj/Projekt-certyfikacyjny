# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Wrap throw-on-error DB calls at SSR/API boundaries

**Context:** SSR Astro pages (frontmatter) and API routes that call the `src/lib/db.ts` helpers — `getProductsByUser`, `getSalesEntriesByUser`, `createProduct`, `createSalesEntry`, etc. These helpers all `throw` on a Supabase/Postgrest error by design.

**Problem:** Call sites repeatedly left these awaits unguarded. A thrown PostgrestError then escapes as a bodyless raw 500 — API routes break the `{ error }` JSON contract the React islands' `readError()` expects, and SSR pages hard-500 instead of degrading. This exact gap was found in all four S-0x impl-reviews (product-catalog-crud, sales-entry routes, supabase-schema, classification-dashboard). The migration-drift 500 from the deploy workflow is the most likely real trigger.

**Rule:** Every call to a throw-on-error db helper from an API route or page frontmatter must be wrapped in try/catch. API routes return `Response.json({ error }, { status: 500 })` (preserving any more-specific status like 409 already handled). SSR pages fall back to a safe empty value (`groups = []` / `initialProducts = []`) rather than letting the page 500. Guard `createClient` returning null separately (503 / empty fallback).

**Applies to:** `src/pages/**/*.astro` frontmatter and `src/pages/api/**/*.ts` handlers that call `src/lib/db.ts` helpers.
