---
change_id: account-deletion-and-data-retention
title: Permanently delete an account and remove associated data per a retention policy
status: implementing
created: 2026-06-22
updated: 2026-06-22
archived_at: null
---

## Notes

Roadmap slice S-07 (see `context/foundation/roadmap.md`). Source for intent: "S-07 z @context/foundation/roadmap.md".

Outcome: owner can permanently delete their account, with all associated data (products, sales entries) removed according to a defined retention policy. Separate project area from the classification / restocking core — concerns the account lifecycle and data-retention contract, not velocity logic.

- PRD refs: NFR-003 (data isolation — deletion is the end-of-lifecycle half of the same per-user data contract), FR-001 / FR-002 (account lifecycle the deletion path extends). Deletion flow + retention policy are not specified in PRD v1; this slice introduces them.
- Prerequisites: F-01. Parallel with S-06.
- **Retention policy (resolved):** immediate, irreversible **hard delete** — no soft-delete window. Settled during `/10x-plan` (see `plan.md`).
- Risk: destructive and irreversible; must cascade correctly (reuse F-01 / S-01 cascade so no `products` or `sales_entries` rows are orphaned) and honor retention requirements. Mis-scoping hard vs. soft delete has compliance implications expensive to reverse after launch.
