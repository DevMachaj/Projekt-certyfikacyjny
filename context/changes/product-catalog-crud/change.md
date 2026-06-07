---
change_id: product-catalog-crud
roadmap_id: S-01
title: Product catalog CRUD — add / edit / delete
status: impl_reviewed
created: 2026-05-30
updated: 2026-06-07
prd_refs: [US-02, FR-003, FR-004, FR-011]
prerequisites: [F-01 supabase-schema-and-types]
---

# Change: Product catalog CRUD (S-01)

Owner can add, edit, and delete products in their catalog (name, stock quantity,
lead time in days, buffer days default 7), with each change reflected immediately
and strict per-account data isolation.

See `plan.md` for the implementation contract and `plan-brief.md` for the two-pager.
