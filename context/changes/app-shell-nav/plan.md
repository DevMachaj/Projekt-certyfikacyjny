# App Shell — Persistent Sidebar Navigation (S-11) Implementation Plan

## Overview

Replace the current per-page, ad-hoc header navigation with a **persistent left sidebar** (from the Claude Design `ui_kits/app` recipe, project `a1fc2530`) wired into every authenticated screen through a new shared `AppLayout.astro`. The sidebar carries the StockHelper wordmark, three nav items — **Dashboard / Produkty / Plan zatowarowania** — with an active state and a **live Understocked count badge** on the Plan item, and an account card pinned to the bottom (initials + email, a link to `/account`, and a Sign out control).

A **new protected `/plan` route** hosts the full itemized weekly restocking plan, moved off the dashboard. The S-04/S-05 engine + deterministic-fallback logic is untouched — only its location changes; its user-facing copy is translated to Polish to match the design's `PlanView`. The dashboard keeps its grouped classification list (its redesign is S-12, out of scope here).

## Current State Analysis

- **No shared app shell.** Every app page (`src/pages/dashboard.astro`, `products.astro`, `account.astro`, `products/[id].astro`) wraps content in the bare `src/layouts/Layout.astro` and renders its **own** `<header>` + `<h1>` plus a `bg-background min-h-screen px-4 py-10` wrapper. `dashboard.astro:46-52` holds the ad-hoc nav being replaced (`Manage products` / `Account` / `Sign out`).
- **`Layout.astro`** is minimal: `<html lang={lang}>` + head + `Banner` + `<slot/>`. It gained an optional `lang` prop in S-10 (default `"en"`). It has no notion of an app chrome.
- **The restocking plan is a self-contained island.** `src/components/dashboard/RestockingPlan.tsx` is rendered on the dashboard via `<RestockingPlan client:load />` (`dashboard.astro:55`). It POSTs to `/api/restocking-plan` on button click and renders the engine-built plan (`headline` + ordered `items` + per-item `reason`/facts, with `source: "ai" | "fallback" | "empty"`). Its copy is **English**. The engine + fallback live in `src/lib/restocking.ts` and the API route — **neither changes**.
- **Middleware** (`src/middleware.ts:4`) guards `PROTECTED_ROUTES = ["/dashboard", "/products", "/account"]` and populates `Astro.locals.user` on every request. `/plan` must be added.
- **Understocked count is derivable** from the existing pure helper `classifyUserCatalog(products, entries)` in `src/lib/dashboard.ts:19` (returns `{ product, classification }[]`); count where `classification.state === "Understocked"`. The dashboard already loads both batches via `getProductsByUser` / `getSalesEntriesByUser`.
- **E2E is mostly additive.** `e2e/protected-routes-auth.spec.ts` asserts the headings `Dashboard` / `Products` / `Account` are hidden when unauthenticated (protected-content markers) and drives the three protected routes' redirects. `e2e/landing.spec.ts:41` asserts the `Dashboard` heading is visible after the authed `/` → `/dashboard` redirect. `e2e/seed.spec.ts` drives the `/products` add/delete flow (`Add product` button, product link, `Delete <name>`). **Nothing** asserts the dashboard-hosted plan, so moving it breaks no existing assertion; keeping the three h1 headings stable keeps the suite green.

### Key Discoveries:

- **The design AppShell is a SPA mockup** (`ui_kits/app/AppShell.jsx`): `view`/`setView` state, nav items are `<button onClick={setView}>`. In our Astro MPA these become `<a href>` links; the **active state is derived from `Astro.url.pathname`**, not React state.
- **`--accent` trap (same as S-10).** The design's indigo action color (`background: var(--accent)` on the wordmark tile, the active-nav `--accent-subtle-fg`) maps to the repo's `--primary` / `--accent-subtle-*`, **never** the repo's muted-gray shadcn `--accent`. The active nav item uses `bg-[var(--accent-subtle)] text-[var(--accent-subtle-fg)]`; hover uses `bg-[var(--surface-sunken)]`.
- **Understocked badge tokens** (design): mono font, `color var(--status-under-fg)`, `background var(--status-under-bg)`, `border var(--status-under-border)`, pill radius — rendered **only when count > 0** (`badge != null && badge > 0`).
- **Sidebar icons are Lucide** (`ui_kits/app/icons.jsx`): `Boxes` (wordmark, already in `src/components/landing/Icon.astro`), `Dashboard`, `Package`, `Clipboard`. The exact path data is in the recipe; inline them as Astro SVG the same way S-10 did.
- **Sign out is a plain POST form.** `src/pages/api/auth/signout.ts` is `POST` → redirects to `/`. The sidebar renders `<form method="POST" action="/api/auth/signout">` with a button — **no island** needed; the whole sidebar is static Astro.
- **The account card has no store-name source.** The app exposes only `user.email`. Per the planning decision, derive initials from the email local-part and show the email as the card label — **no schema change** (a store-name field is deferred; it would touch F-01).
- **`AppLayout` computes the badge itself** (planning decision: server-compute in the shell) so the number is consistent on every page, fresh per navigation. On the dashboard this means one extra products+entries query beyond the page's own — accepted (small catalogs; NFR-001 holds). All DB reads are wrapped per `context/foundation/lessons.md` (throw-on-error helpers) and degrade to a hidden badge on failure.

## Desired End State

Every authenticated page (`/dashboard`, `/products`, `/products/[id]`, `/account`, `/plan`) renders inside the persistent shell: sidebar on the left (wordmark, three nav items with the current route highlighted, a live Understocked badge on **Plan zatowarowania**, an account card with initials + email + a `/account` link + Sign out), and a main column whose header shows the page title. The old dashboard header nav is gone.

`/plan` is a new protected route showing the full weekly restocking plan (the island moved off the dashboard, copy in Polish); the dashboard no longer renders it. `/plan` is in `PROTECTED_ROUTES`. `/` (landing) and `/auth/*` keep the bare `Layout` — no shell.

Verification: existing English headings (`Dashboard`, `Products`, `Account`) and the `/products` add/delete flow still pass their specs; new specs lock `/plan`'s guard, the nav, the active state, and the plan's relocation. `npm run build`, `npm run lint`, `npm run astro check`, `npm test`, and `npx playwright test` all pass.

## What We're NOT Doing

- **Not** redesigning the dashboard (grouped state cards + rich rows) — that is **S-12**. The dashboard keeps its current grouped list; only its outer chrome (shell) and the removal of the plan island change here.
- **Not** changing any engine, classification, restocking, auth, or API logic. `src/lib/restocking.ts`, `/api/restocking-plan`, and the dashboard grouping are untouched. The plan island's rendering logic is unchanged; only its **location** and **display copy** change.
- **Not** adding a store-name field / profile table / any migration. The account card is derived from `user.email`.
- **Not** translating the whole app to Polish. Only the **nav chrome** and the **new `/plan` page + moved plan island** are Polish; `Dashboard` / `Products` / `Account` page headings and their islands stay English (E2E stability). The full EN→PL migration remains future work.
- **Not** adding mobile / responsive sidebar behavior (desktop-only per PRD non-goals) — no hamburger, no collapse.
- **Not** lifting page primary actions into the shell header (planning decision) — the Products "Add product" trigger and other island-owned actions stay where they are; the shell header shows title (+ optional subtitle) only.
- **Not** adding real-time push for the badge — "live" means server-rendered fresh on each navigation, not websockets/polling.

## Implementation Approach

Three phases, each independently verifiable. **Phase 1** builds the shell chrome (`Sidebar.astro` + `AppLayout.astro`) with only the two always-valid nav items (Dashboard, Produkty) and the account card, and switches the four existing app pages onto it — **no route changes**, so the existing E2E suite is the no-regression proof. **Phase 2** adds the `/plan` route, moves the restocking island onto it (translated), adds the third nav item with the live Understocked badge, and registers `/plan` in the middleware — the phase that touches routes/nav. **Phase 3** is the E2E gate: extend the protected-routes spec for `/plan` and add a nav/relocation spec, then run the whole suite green.

All shell markup is `.astro` (static, no islands — the sign-out form and nav links need no JS). Design recipes are pulled from the `claude_design` MCP and translated to repo tokens using the S-08 delta (type `--text-*`→`--fs-*`, tracking `--tracking-*`→`--track-*`, shadow `--shadow-*`→`--ds-shadow-*`, and the `--accent`→`--primary`/`--accent-subtle` rule). Read the `frontend-design` skill before implementing.

## Critical Implementation Details

- **Active-state derivation.** Compute active per nav item from `Astro.url.pathname`: Dashboard active iff pathname `=== "/dashboard"`; Produkty active iff pathname `=== "/products"` **or** starts with `"/products/"` (so product detail keeps Produkty highlighted); Plan active iff pathname `=== "/plan"`. Pass the pathname (or a resolved `active` key) from `AppLayout` into `Sidebar`.
- **Badge query is guarded and non-fatal.** In `AppLayout` frontmatter, wrap the products+entries load + `classifyUserCatalog` count in try/catch (per `context/foundation/lessons.md`); on any error or a null `createClient`, treat the count as `0` (badge hidden). The shell must never 500 a page over the badge.
- **Accessible-name stability.** The page `<h1>` accessible names `Dashboard`, `Products`, `Account` must survive the move into the shell header (they become the `AppLayout` `title`). The sidebar nav adds a **link** named `Dashboard` — a different role than the heading, so `getByRole("heading", …)` locators stay unambiguous. The `/products` island (add/delete flow) is not restructured, so `seed.spec.ts` locators hold.
- **Redirect-safe order (moved plan).** `/plan` is SSR and guarded by the middleware; no page-level redirect is needed. It renders the island the same way the dashboard did — the island fetches on click, so `/plan` needs no SSR plan data (only the shell's badge query).

## Phase 1: App shell + AppLayout (no route changes)

### Overview

Build the sidebar chrome and the shared layout, and move the four existing app pages onto it, dropping their per-page headers. No new routes, no middleware change, no plan move — so the existing E2E suite proves no regression.

### Changes Required:

#### 1. Sidebar icons

**File**: `src/components/app/Icon.astro` (or extend the existing `src/components/landing/Icon.astro` into a shared location)

**Intent**: Provide the Lucide inline-SVG icons the sidebar needs (`boxes`, `dashboard`, `package`, `clipboard`) following the S-10 icon pattern (decorative, `aria-hidden`, `currentColor`, sized by prop).

**Contract**: Same shape as `src/components/landing/Icon.astro` (a `Record<string, string[]>` of path data keyed by icon name, declared **before** the render body — avoid the TDZ trap from S-10 where a lookup referenced the map before its `const`; see the landing Icon.astro comment). Path data for `dashboard` / `package` / `clipboard` is copied verbatim from the design `ui_kits/app/icons.jsx`. Reuse `boxes` from the existing set. Prefer one shared icon component over duplicating the map.

#### 2. Sidebar component

**File**: `src/components/app/Sidebar.astro`

**Intent**: The persistent left rail — wordmark, nav items with active state, and the account card — rendered from server data only (no island).

**Contract**: Props: `active` (the resolved nav key: `"dashboard" | "products" | "plan"`), `email` (string), and `understockedCount` (number, default `0`). Layout per the design `AppShell` recipe: fixed width `var(--sidebar-w)`, `bg-[var(--surface)]`, right border, column flex. Wordmark = indigo (`bg-primary`) Boxes tile + "StockHelper" (reuse the S-10 wordmark idiom). Nav = `<a>` links styled as the recipe's `NavItem`: active → `bg-[var(--accent-subtle)] text-[var(--accent-subtle-fg)]`, inactive → `text-muted-foreground` with `hover:bg-[var(--surface-sunken)]`; each has an icon + label. In Phase 1 render only **Dashboard** (`/dashboard`, `dashboard` icon) and **Produkty** (`/products`, `package` icon). Account card pinned bottom (`mt-auto`, top border): initials circle (`bg-[var(--indigo-100)] text-[var(--indigo-700)]`, initials from the email local-part) + email label, wrapped so the card is an `<a href="/account">`, with a Sign out `<form method="POST" action="/api/auth/signout">` button. (The Plan item + badge arrive in Phase 2 — `understockedCount` is threaded now but unused until then.)

#### 3. Shared app layout

**File**: `src/layouts/AppLayout.astro`

**Intent**: Compose the bare `Layout` (html/head/Banner/lang) with the sidebar + a main column whose header shows the page title, and compute the Understocked badge once for the sidebar.

**Contract**: Props: `title` (string), `subtitle?` (string), plus it reads `Astro.locals.user`. Frontmatter resolves the `active` key from `Astro.url.pathname` (see Critical Implementation Details), derives `email` from `user`, and computes `understockedCount` via a guarded `getProductsByUser` + `getSalesEntriesByUser` + `classifyUserCatalog(...).filter(c => c.classification.state === "Understocked").length` (fallback `0` on error/null client). Renders `<Layout title={title}>` wrapping a flex row: `<Sidebar active email understockedCount />` + `<main>` with a header (`<h1>{title}</h1>` + optional subtitle) and a scrollable content area hosting `<slot/>`, matching the design's main-column structure (max-width content, header bottom border). The `<h1>` is the accessible-name anchor the specs rely on.

#### 4. Switch existing app pages onto AppLayout

**Files**: `src/pages/dashboard.astro`, `src/pages/products.astro`, `src/pages/account.astro`, `src/pages/products/[id].astro`

**Intent**: Render each page's content inside the shell and delete its now-duplicated per-page header + outer wrapper.

**Contract**: Replace `<Layout title=…>` + the page's `<header>`/`<h1>` + `bg-background min-h-screen px-4 py-10` wrapper with `<AppLayout title=…>` wrapping just the page's content body. Titles stay **English**: `Dashboard`, `Products`, `Account`, and `product.name` (`"Product not found"` fallback) for detail. Remove the dashboard's `Manage products` / `Account` / `Sign out` header block and the per-page "Signed in as {email}" subtitle (email now lives in the sidebar card). Keep the product-detail "← Back to products" link and all island mounts (`RestockingPlan` still on the dashboard for now, `ProductCatalog`, `ProductDetail`, `AccountDangerZone`) exactly as they are. Preserve each page's existing guarded data-loading frontmatter.

### Success Criteria:

#### Automated Verification:

- Build passes: `npm run build`
- Lint passes: `npm run lint`
- Type/astro check passes: `npm run astro check`
- Unit tests pass: `npm test`
- Existing E2E stays green: `npx playwright test` (headings `Dashboard`/`Products`/`Account` and the `/products` flow unchanged)

#### Manual Verification:

- The sidebar renders on `/dashboard`, `/products`, `/products/[id]`, and `/account` with the wordmark, Dashboard + Produkty items, and the account card; auth pages and `/` show **no** sidebar.
- The active nav item matches the current route (Produkty stays active on a product detail page).
- The account card links to `/account`; Sign out logs the user out and lands on `/`.
- Colors/spacing match `ui_kits/app` (translated): indigo wordmark tile, `--accent-subtle` active state, gray hover.

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 2.

---

## Phase 2: /plan route + move the plan + Plan nav item + live badge + middleware

### Overview

Create the protected `/plan` route hosting the relocated (Polish) restocking plan, remove the plan from the dashboard, add the third nav item with the live Understocked badge, and register `/plan` in the middleware.

### Changes Required:

#### 1. Register the new protected route

**File**: `src/middleware.ts`

**Intent**: Guard `/plan` like the other authenticated routes.

**Contract**: Add `"/plan"` to `PROTECTED_ROUTES`. No other middleware change (the existing `startsWith` guard + `Astro.locals.user` population already cover it).

#### 2. New `/plan` page

**File**: `src/pages/plan.astro`

**Intent**: Host the full itemized weekly restocking plan on its own route, inside the shell.

**Contract**: `<AppLayout title="Plan zatowarowania">` wrapping `<RestockingPlan client:load />`. SSR, guarded by the middleware — no page-level redirect, no SSR plan data (the island fetches on click). The `Plan zatowarowania` `<h1>` (from `AppLayout title`) is the accessible-name anchor for the Phase 3 specs.

#### 3. Move the plan off the dashboard

**File**: `src/pages/dashboard.astro`

**Intent**: The dashboard no longer hosts the restocking plan (it now lives on `/plan`).

**Contract**: Remove the `<RestockingPlan client:load />` mount and its import. The grouped classification list and empty-state are unchanged. (The dashboard still computes its groups; the shell computes the badge separately.)

#### 4. Translate the moved plan island to Polish

**File**: `src/components/dashboard/RestockingPlan.tsx` (consider relocating to `src/components/plan/RestockingPlan.tsx`)

**Intent**: Match the design `PlanView` copy now that the plan is a first-class Polish page — **display strings only**, no logic change.

**Contract**: Translate the user-facing strings to Polish (title "Plan na ten tydzień", the descriptive subcopy, the button label `Generuj plan` / `Generuję…`, the error/`fallback`/`empty` messages, and the per-item facts line `…d zapasu · …d czas dostawy`) per `ui_kits/app/PlanView.jsx`. The engine-driven values (`headline`, `items`, `action`, `reason`, quantities, order, `source`) and all fetch/state logic stay exactly as-is. If relocated, update the import in `plan.astro` and delete the old path (verify no other importer via grep).

#### 5. Add the Plan nav item + live badge

**Files**: `src/components/app/Sidebar.astro`, `src/layouts/AppLayout.astro`

**Intent**: Surface the third nav destination and the live Understocked count.

**Contract**: In `Sidebar.astro`, add the **Plan zatowarowania** nav item (`/plan`, `clipboard` icon), active when `active === "plan"`, rendering the Understocked badge when `understockedCount > 0` (mono, `bg-[var(--status-under-bg)] text-[var(--status-under-fg)] border-[var(--status-under-border)]`, pill). `AppLayout` already computes `understockedCount` (Phase 1) and now resolves `active === "plan"` for `/plan`. No new query — the Phase 1 badge computation is reused.

### Success Criteria:

#### Automated Verification:

- Build passes: `npm run build`
- Lint passes: `npm run lint`
- Type/astro check passes: `npm run astro check`
- Unit tests pass: `npm test`
- No dead imports after the move: `grep -rn "dashboard/RestockingPlan" src` returns nothing (if relocated)

#### Manual Verification:

- `/plan` renders the restocking plan inside the shell (Polish copy); generating a plan still returns the prioritized list (engine order/quantities intact, AI/fallback/empty states work).
- The dashboard no longer shows the plan generator.
- The Plan nav item shows the Understocked count badge (matching the dashboard's Understocked group size) and hides it when the count is 0.
- Unauthenticated `/plan` redirects to `/auth/signin`.

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 3.

---

## Phase 3: E2E coverage + full verification (gate)

### Overview

Lock the new route guard, the nav, the active state, and the plan's relocation with Playwright, then run the whole suite green.

### Changes Required:

#### 1. Guard coverage for `/plan`

**File**: `e2e/protected-routes-auth.spec.ts`

**Intent**: Assert the new route rejects unauthenticated access like the others.

**Contract**: Add `{ path: "/plan", protectedHeading: "Plan zatowarowania" }` to the `PROTECTED_ROUTES` array the spec iterates — the existing loop then asserts unauth `/plan` → `/auth/signin` and that the `Plan zatowarowania` heading is hidden. No other change.

#### 2. Nav + relocation spec

**File**: `e2e/app-shell.spec.ts`

**Intent**: Lock the sidebar nav, the active state, and that the plan moved from the dashboard to `/plan`.

**Contract**: Authenticated (project `storageState`). Assert: the sidebar exposes nav **links** `Dashboard`, `Produkty`, `Plan zatowarowania` (`getByRole("link", …)`); clicking `Plan zatowarowania` navigates to `/plan` (`waitForURL("**/plan")`) and shows the `Plan zatowarowania` heading + the plan generate control; the plan generate control is **absent** on `/dashboard` (relocation proof); and the `Dashboard` heading still shows on `/dashboard`. Use role/label locators and wait-on-state only (never `waitForTimeout`), per CLAUDE.md. Pick a stable accessible name for the plan's generate button and keep it byte-stable.

### Success Criteria:

#### Automated Verification:

- Build passes: `npm run build`
- Lint passes: `npm run lint`
- Type/astro check passes: `npm run astro check`
- Unit tests pass: `npm test`
- Full E2E suite green: `npx playwright test` (dev server on :4321; `playwright/.auth/user.json` must be a live session — refresh if expired)

#### Manual Verification:

- The new specs pass in isolation (`npx playwright test e2e/app-shell.spec.ts`) both the nav and the relocation assertions.
- No regression in `landing.spec.ts`, `protected-routes-auth.spec.ts`, or `seed.spec.ts`.

**Implementation Note**: After all automated verification passes, pause for final manual confirmation.

---

## Testing Strategy

### Unit Tests:

- None required — the shell is static presentation and the badge count reuses the already-tested `classifyUserCatalog` (`src/lib/dashboard.test.ts`). Existing unit suites must stay green (regression guard).

### Integration / E2E Tests:

- `protected-routes-auth.spec.ts` (Phase 3): `/plan` joins the guarded-routes loop.
- `app-shell.spec.ts` (Phase 3): nav links + active state + plan relocation (generator on `/plan`, absent on `/dashboard`).
- Existing `landing.spec.ts` / `seed.spec.ts` stay green unchanged.

### Manual Testing Steps:

1. Logged in, visit each app route — confirm the sidebar renders, the active item matches, and the badge shows the Understocked count (cross-check against the dashboard's Understocked group).
2. Click `Plan zatowarowania` → land on `/plan`; generate a plan; confirm the prioritized list, quantities, and AI/fallback/empty states behave as before the move.
3. Confirm the dashboard no longer shows the plan generator.
4. Use the account card: open `/account`, then Sign out → land on `/`.
5. Logged out, hit `/plan` → redirect to `/auth/signin`.
6. Compare the shell against `ui_kits/app` (via `claude_design` MCP): indigo wordmark tile, `--accent-subtle` active state, Understocked badge hue, account card.

## Performance Considerations

The shell adds one guarded products+entries query per authenticated page (for the badge), reusing the pure `classifyUserCatalog`. On the dashboard this is a second read beyond the page's own — accepted at MVP catalog sizes and within NFR-001. The sidebar is static Astro (zero client JS); the only island on `/plan` is the existing `RestockingPlan` (fetch-on-click, unchanged). If the extra read ever matters, `AppLayout` can later accept an optional `understockedCount` prop that the dashboard passes from its own already-loaded batches — noted, not built.

## Migration Notes

- No data/schema migration. The account card is derived from `user.email`; no store-name field is introduced.
- `RestockingPlan.tsx` may be relocated from `src/components/dashboard/` to `src/components/plan/`; if so, update the importer and remove the dead path (grep-verified). The engine/API/route are untouched.
- EN-app / PL-chrome split is a deliberate transitional state (page headings stay English for E2E stability); the full Polish migration remains future work.

## References

- Roadmap slice: `context/foundation/roadmap.md` § S-11
- Design source: Claude Design project `a1fc2530-a078-42b2-a0ae-501b94b777a0` → `ui_kits/app/{AppShell.jsx,PlanView.jsx,icons.jsx,README.md}` (via `claude_design` MCP)
- Frontend design guidance: `frontend-design` skill (read before implementing)
- Prior UI slice (token translation + Astro/React boundary + the TDZ / eslint `.astro` gotchas): `context/changes/landing-page/plan.md`, `src/components/landing/{Icon,Wordmark}.astro`
- Recurring rule: `context/foundation/lessons.md` (wrap throw-on-error DB calls at SSR/API boundaries — applies to the `AppLayout` badge query)
- Route guard: `src/middleware.ts:4` (`PROTECTED_ROUTES`)
- Reused helper: `src/lib/dashboard.ts:19` (`classifyUserCatalog`); DB helpers `src/lib/db.ts`
- Sign out: `src/pages/api/auth/signout.ts` (POST → `/`)
- E2E patterns to mirror: `e2e/protected-routes-auth.spec.ts`, `e2e/landing.spec.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: App shell + AppLayout (no route changes)

#### Automated

- [x] 1.1 Build passes: `npm run build`
- [x] 1.2 Lint passes: `npm run lint`
- [x] 1.3 Type/astro check passes: `npm run astro check`
- [x] 1.4 Unit tests pass: `npm test`
- [x] 1.5 Existing E2E stays green: `npx playwright test`

#### Manual

- [ ] 1.6 Sidebar renders on the 4 app pages (wordmark, Dashboard + Produkty, account card); no sidebar on auth/`/`
- [ ] 1.7 Active nav item matches the current route (Produkty active on product detail)
- [ ] 1.8 Account card links to `/account`; Sign out lands on `/`
- [ ] 1.9 Visual match to `ui_kits/app` (translated): indigo wordmark, `--accent-subtle` active, gray hover

### Phase 2: /plan route + move the plan + Plan nav item + live badge + middleware

#### Automated

- [ ] 2.1 Build passes: `npm run build`
- [ ] 2.2 Lint passes: `npm run lint`
- [ ] 2.3 Type/astro check passes: `npm run astro check`
- [ ] 2.4 Unit tests pass: `npm test`
- [ ] 2.5 No dead imports after the move: `grep -rn "dashboard/RestockingPlan" src` returns nothing (if relocated)

#### Manual

- [ ] 2.6 `/plan` renders the plan in the shell (Polish); generate returns the prioritized list; AI/fallback/empty states work
- [ ] 2.7 Dashboard no longer shows the plan generator
- [ ] 2.8 Plan nav item shows the Understocked badge (matches dashboard Understocked group); hidden when count is 0
- [ ] 2.9 Unauthenticated `/plan` redirects to `/auth/signin`

### Phase 3: E2E coverage + full verification (gate)

#### Automated

- [ ] 3.1 Build passes: `npm run build`
- [ ] 3.2 Lint passes: `npm run lint`
- [ ] 3.3 Type/astro check passes: `npm run astro check`
- [ ] 3.4 Unit tests pass: `npm test`
- [ ] 3.5 Full E2E suite green: `npx playwright test`

#### Manual

- [ ] 3.6 `e2e/app-shell.spec.ts` passes in isolation (nav + relocation)
- [ ] 3.7 No regression in `landing.spec.ts`, `protected-routes-auth.spec.ts`, or `seed.spec.ts`
