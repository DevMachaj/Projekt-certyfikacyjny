---
id: supabase-schema-and-types
roadmap_id: F-01
title: Supabase schema and domain types
status: impl_reviewed
created: 2026-05-30
updated: 2026-06-07
---

# Change: Supabase Schema and Domain Types

**Roadmap item:** F-01  
**Change ID:** supabase-schema-and-types

## Summary

Create `products` and `sales_entries` tables in Supabase with per-operation RLS policies, TypeScript domain entity types in `src/types.ts`, and typed reference query patterns in `src/lib/db.ts`.

## Unlocks

- S-01: product-catalog-crud (requires `products` table)
- S-02: sales-entry-and-classification (requires `sales_entries` table + RLS)
- S-03: classification-dashboard (queries both tables)
