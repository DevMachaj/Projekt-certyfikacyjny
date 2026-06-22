---
change_id: ux-improvements
title: "UX improvements: bulk review actions, session reset, loading states"
status: implemented
created: 2026-06-22
updated: 2026-06-22
archived_at: null
---

## Notes

Roadmap slice S-06 (`context/foundation/roadmap.md`).

Close three friction points observed while building S-01 through S-04:

- **Bulk actions during candidate review** — apply actions to multiple candidates at once instead of one-at-a-time.
- **Reset a review session** — start a review over from scratch.
- **Clear loading states** — explicit loading indicators while data is fetching (NFR-001 perceived responsiveness).

Prerequisites: F-01. Parallel with S-07. Low risk — surface-level UX, no schema or classification-engine changes. Watch for scope creep: keep the action set fixed to these three gaps and defer anything else to the backlog. Which screens get bulk actions / what the action set is (e.g. bulk delete) is for `/10x-plan` to scope.
