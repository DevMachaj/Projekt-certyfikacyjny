---
change_id: sales-entry-and-classification
roadmap_id: S-02
title: Sales entry logging + velocity classification (north star)
status: archived
created: 2026-05-31
updated: 2026-07-25
archived_at: 2026-07-25T17:44:59Z
prd_refs: [US-01, US-03, FR-005, FR-006, FR-007, FR-008, FR-012, NFR-001]
prerequisites: [F-01 supabase-schema-and-types, S-01 product-catalog-crud]
---

# Change: Sales entry logging + velocity classification (S-02 — North star)

Owner can log one or more non-overlapping sales entries (units sold, start date,
end date) for a product — overlapping ranges rejected — and immediately see the
resulting velocity classification (Understocked / Watch / OK / Slow-mover /
Insufficient data) with the threshold definition for that state and the specific
recommended action ("Order X units" / "Consider promotion" / "Set lead time to
get reorder suggestion"). Owner can also delete a sales entry and see the
classification recalculate immediately.

This is the roadmap North star: the smallest end-to-end slice that proves the
core product hypothesis — that turning raw sales data into a classified state
plus a specific recommendation is meaningfully better than a spreadsheet.

See `plan.md` for the implementation contract and `plan-brief.md` for the two-pager.
