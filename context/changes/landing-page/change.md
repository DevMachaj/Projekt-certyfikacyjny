---
change_id: landing-page
title: Landing page (S-10)
status: implementing
created: 2026-07-20
updated: 2026-07-20
archived_at: null
---

## Notes

S-10 z @context/foundation/roadmap.md — prereq: S-08 (`design-system-refresh`, done). Parallel z S-09 (`screens-restyle`, już zaimplementowane).

Zakres: zastąpienie domyślnego route `/` (obecnie boilerplate "10x Astro Starter" / `Welcome.astro`) realnym, **publicznym** landing page w light design systemie S-08, wg recepty `ui_kits/landing` z projektu Claude Design `a1fc2530`. Pięć sekcji: Nav → Hero → Jak to działa (3 kroki) → Podgląd produktu (mini-dashboard, 5 stanów) → Final CTA + footer. Copy **po polsku** (zgodnie z designem).

Routing: page-level `Astro.redirect('/dashboard')` w frontmatterze `index.astro`, gdy user zalogowany; anon widzi landing. `/` **zostaje publiczne** — NIE dodawać do `PROTECTED_ROUTES` w `src/middleware.ts`.

Struktura: Astro-only, wydzielone komponenty sekcji w `src/components/landing/*.astro`. Usunięcie martwego boilerplate (`Welcome.astro` + `Topbar.astro`). Nowy E2E spec (anon widzi hero; authed → redirect). Design przez MCP `claude_design`; przed implementacją przeczytać skill `frontend-design`.

Plan: `plan.md` (+ `plan-brief.md`). 3 fazy, każda weryfikowalna osobno.
