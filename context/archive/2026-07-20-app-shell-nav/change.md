---
change_id: app-shell-nav
title: App shell — persistent sidebar navigation (S-11)
status: archived
created: 2026-07-20
updated: 2026-07-25
archived_at: 2026-07-25T17:44:59Z
---

## Notes

S-11 z @context/foundation/roadmap.md — prereq: S-09 (`screens-restyle`, done). Parallel z S-10 (`landing-page`, zaimplementowane).

Zakres: trwały lewy sidebar (wg Claude Design `ui_kits/app/AppShell.jsx`, projekt `a1fc2530`) — wordmark (Boxes + „StockHelper"), nav **Dashboard / Produkty / Plan zatowarowania** z active state i **live badge liczby Understocked** na pozycji Planu, karta konta przypięta na dole (inicjały z e-maila + e-mail, link do `/account` + Wyloguj). Wpięcie w każdy uwierzytelniony ekran przez nowy `AppLayout.astro`. Nowy **chroniony route `/plan`** hostujący pełny itemizowany plan zatowarowania przeniesiony z dashboardu (logika S-04/S-05 bez zmian — zmienia się tylko lokalizacja; copy planu tłumaczone na PL).

Decyzje (z sesji /10x-plan): (1) PL chrome + PL strona /plan, nagłówki Dashboard/Products/Account zostają EN (stabilność E2E); (2) badge liczony server-side w shellu; (3) nazwa sklepu wyprowadzona z e-maila (bez migracji); (4) karta konta = link do /account + Wyloguj; (5) nowy `AppLayout.astro` komponujący `Layout`; (6) akcje stron zostają w wyspach.

E2E: dodać `/plan` do `PROTECTED_ROUTES` + spec redirectu, dodać spec nawigacji/active-state + przeniesionego planu; utrzymać stabilne nazwy dostępne istniejących nagłówków. Gate E2E po fazie ruszającej route/nav. Przed implementacją przeczytać `frontend-design`.

Brak `research.md` (referencja w zleceniu nie istniała) — kontekst zebrany z roadmap S-11 + kodu + recept `claude_design`. Plan: `plan.md` (+ `plan-brief.md`). 3 fazy, każda weryfikowalna osobno.
