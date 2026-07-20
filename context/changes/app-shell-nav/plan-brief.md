# App Shell — Persistent Sidebar Navigation (S-11) — Plan Brief

> Full plan: `context/changes/app-shell-nav/plan.md`

## What & Why

Replace StockHelper's per-page, ad-hoc header navigation with a **persistent left sidebar** (from the Claude Design `ui_kits/app` recipe) wired into every authenticated screen, and give the weekly restocking plan its **own `/plan` route** instead of squatting on the dashboard. This turns a set of loosely-linked pages into a coherent app with a single, always-present navigation and a clear home for the plan.

## Starting Point

There is no shared app shell today: `dashboard.astro`, `products.astro`, `account.astro`, and `products/[id].astro` each render their own `<header>`/`<h1>` inside the bare `Layout.astro`, and the dashboard carries the only nav (`Manage products` / `Account` / `Sign out`). The restocking plan is a self-contained island (`RestockingPlan.tsx`) mounted on the dashboard; its engine + fallback logic (S-04/S-05) is stable. Middleware guards `/dashboard`, `/products`, `/account`.

## Desired End State

Every authenticated page renders inside the shell: a sidebar (wordmark · **Dashboard / Produkty / Plan zatowarowania** with active state + a live Understocked count badge on the Plan item · an account card with initials + email + a `/account` link + Sign out) and a main column with the page title. A new protected `/plan` route hosts the full itemized restocking plan (moved off the dashboard, copy in Polish); the dashboard keeps its grouped list. Landing + auth pages stay bare.

## Key Decisions Made

| Decision         | Choice                                                                             | Why (1 sentence)                                                                                      | Source |
| ---------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------ |
| Copy scope       | PL nav chrome + PL `/plan` page; `Dashboard`/`Products`/`Account` headings stay EN | Match the design on new surfaces while existing E2E heading locators stay stable.                     | Plan   |
| Badge data       | Server-computed in the shell (`AppLayout` frontmatter)                             | Consistent number on every page, fresh per navigation, no new endpoint; reuses `classifyUserCatalog`. | Plan   |
| Store name       | Derived from `user.email` (initials + email), no schema                            | Ships now with zero migration; a store-name field would touch F-01.                                   | Plan   |
| Account + logout | Account card = link to `/account` + a Sign out control                             | Consolidates what the replaced header held into the card the design pins.                             | Plan   |
| Shell wiring     | New `AppLayout.astro` composing the bare `Layout`                                  | Clean separation; auth/landing keep the bare layout with zero shell code.                             | Plan   |
| Page actions     | Stay island-owned; shell header = title/subtitle only                              | Minimal churn; keeps `seed.spec.ts`'s add/delete flow valid.                                          | Plan   |

## Scope

**In scope:** `Sidebar.astro` + shared `AppLayout.astro`; wire the 4 existing app pages onto it; new protected `/plan` route; move + translate the restocking island; live Understocked badge; `/plan` in `PROTECTED_ROUTES`; E2E for the new route + nav.

**Out of scope:** dashboard redesign (S-12); any engine/API/auth/data change; store-name schema; full app translation; mobile/responsive sidebar; lifting page actions into the header.

## Architecture / Approach

`AppLayout.astro` composes `Layout` (html/head/Banner/lang) + `Sidebar.astro` + a main column whose header is the page `<h1>`. Its frontmatter resolves the active nav key from `Astro.url.pathname` and computes the Understocked count with a **guarded** products+entries load → `classifyUserCatalog(...)` filter (fallback 0 on error, per `lessons.md`). The sidebar is pure static Astro — nav are `<a>` links, Sign out is a `<form>` POST. `/plan` hosts the existing `RestockingPlan` island unchanged in logic (Polish copy only). The `--accent`→`--primary`/`--accent-subtle` token rule from S-10 applies to the wordmark tile and the active nav state.

## Phases at a Glance

| Phase                                                              | What it delivers                                                                      | Key risk                                                                                      |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 1. App shell + `AppLayout` (no route changes)                      | Sidebar (Dashboard + Produkty + account card) wired into the 4 existing pages         | Regressing existing heading/flow locators — mitigated by keeping EN headings + island actions |
| 2. `/plan` route + move plan + Plan item + live badge + middleware | Protected `/plan` with the relocated Polish plan; third nav item + Understocked badge | Broken link / dead import mid-move; badge query cost on every page                            |
| 3. E2E coverage + full verification (gate)                         | `/plan` guard spec + nav/relocation spec; full suite green                            | Auth `storageState` must be a live session                                                    |

**Prerequisites:** S-09 (done) + S-10 (shipped); `claude_design` MCP access; a live `playwright/.auth/user.json`.
**Estimated effort:** ~1 session across 3 phases (presentation + one route + E2E).

## Open Risks & Assumptions

- **No `research.md`** existed (the invocation referenced one); context was reconstructed from the roadmap S-11 entry, the codebase, and the design recipes. If a research doc surfaces later, reconcile.
- The badge adds one guarded query per authenticated page (a second read on the dashboard) — accepted at MVP scale; an optional prop-override is noted as a future optimization.
- The EN-app / PL-chrome split is an accepted transitional state; page headings stay English purely for E2E stability.

## Success Criteria (Summary)

- Every authenticated page shows the persistent sidebar with the correct active item and a live Understocked badge; auth/landing stay bare.
- `/plan` (protected) hosts the restocking plan; the dashboard no longer does; engine order/quantities/fallback behave exactly as before.
- `npm run build` / `lint` / `astro check` / `test` and the full Playwright suite (existing + new `/plan` guard + nav/relocation specs) all pass.
