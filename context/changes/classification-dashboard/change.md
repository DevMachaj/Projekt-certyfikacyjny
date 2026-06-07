---
change_id: classification-dashboard
roadmap_id: S-03
title: Classification dashboard
status: impl_reviewed
created: 2026-06-06
updated: 2026-06-07
prd_refs: [FR-009, NFR-001, NFR-003]
prerequisites: [F-01 supabase-schema-and-types, S-01 product-catalog-crud, S-02 sales-entry-and-classification]
---

# Change: Classification dashboard (S-03)

Owner can view all of their products grouped by classification state in the
fixed order (Understocked → Watch → OK → Slow-mover → Insufficient data),
sorted alphabetically within each group, on the dashboard page. Each card shows
the product name, its state badge, and the specific recommended action.

This is the roadmap's "see the whole catalog's health at a glance" slice — the
multi-product complement to S-02's single-product detail view. It reuses the
S-02 classification engine unchanged; the new work is a batch (non-N+1) data
layer and the grouped SSR dashboard.

See `plan.md` for the implementation contract and `plan-brief.md` for the two-pager.
