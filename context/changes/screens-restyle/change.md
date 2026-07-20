---
change_id: screens-restyle
title: Screens restyle (S-09)
status: implemented
created: 2026-07-20
updated: 2026-07-20
archived_at: null
---

## Notes

S-09 z @context/foundation/roadmap.md — prereq: S-08 (`design-system-refresh`, done). Parallel z S-10 (`landing-page`).

Zakres: zastosowanie light design systemu z S-08 do realnych ekranów aplikacji (dashboard, products list, product forms, product detail, restocking plan) + account/auth (bo restyle współdzielonego `FormField` i tak na nie spływa). Usunięcie zahardkodowanych ciemnych klas (`bg-cosmic`, `bg-white/5`, `border-white/10`, `bg-purple-600`, gradientowe nagłówki) na rzecz tokenów i komponentów S-08 (`Button`, `Card`, `Input`-via-`FormField`, `Badge`).

**Warstwa wizualna tylko** — bez zmian logiki wysp React, bez zmian API. Twardy kontrakt: wszystkie accessible names / role / labels / `type="number"` / route `/auth/signin` bez zmian (E2E). Design source of truth: projekt Claude Design `a1fc2530-a078-42b2-a0ae-501b94b777a0`, czytany przez MCP `claude_design`.

Plan: `plan.md` (+ `plan-brief.md`). Split BY SCREEN — 4 fazy, każda z pełnym E2E gate.
