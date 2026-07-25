---
change_id: ai-weekly-restocking-plan
title: AI-generated weekly restocking summary from existing classifications
status: archived
created: 2026-06-07
updated: 2026-07-25
archived_at: 2026-07-25T17:44:59Z
---

## Notes

Roadmap slice S-04 (see `context/foundation/roadmap.md`). Prerequisite: S-03.

Owner clicks a button and gets one AI-generated weekly restocking summary of what to reorder, built from the products the deterministic engine has already classified as Understocked or Watch. The engine still makes the business decision (which products need restocking and the recommended quantity); the AI only summarizes those existing recommendations into a single readable weekly plan.

PRD refs: US-01 (classification + recommendation the summary is built from), FR-006 (Understocked / Watch states select which products enter the summary), FR-007 (the "Order X units" action the summary restates per product).

Risk: first slice that integrates an LLM. The deterministic engine still makes the business decision; the AI only summarizes existing output, so a bad or hallucinated LLM response can mislead the wording of the summary but cannot corrupt the underlying recommendation or classification. This is also the first AI feature in the project (`tech-stack.md` `has_ai: true`).
