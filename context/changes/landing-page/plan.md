# Landing Page (S-10) Implementation Plan

## Overview

Replace the default `/` route — currently the "10x Astro Starter" boilerplate (`index.astro` → `Welcome.astro` → dark "cosmic" hero + feature cards) — with a real, **public** StockHelper landing page rendered in the S-08 light design system and matching the Claude Design `ui_kits/landing` recipe (project `a1fc2530`). The page has five sections: sticky **Nav**, **Hero**, **Jak to działa** (3 steps), **Podgląd produktu** (an inline mini-dashboard mockup showing all five velocity-classification states), and a **Final CTA + footer**. Copy is **Polish**, per the design.

The route's access contract is the delicate part: `/` must stay reachable by anonymous visitors (so it is **not** added to `PROTECTED_ROUTES`), while authenticated visitors must be sent to `/dashboard`. This is resolved with a **page-level** session check in `index.astro`'s frontmatter, not a middleware change.

## Current State Analysis

- **`src/pages/index.astro`** imports and renders `Welcome.astro` inside `Layout` — no session logic. `Welcome.astro` is the dark boilerplate hero (`bg-cosmic`, cosmic orbs, gradient heading, `bg-purple-600` CTA buttons, three feature cards) and imports `Topbar.astro`.
- **`Welcome.astro` is imported only by `index.astro`; `Topbar.astro` is imported only by `Welcome.astro`** (verified by grep) — both go dead the moment `index.astro` stops rendering `Welcome`. `bg-cosmic` remains referenced by `design-preview.astro` (a dev reference page), so its `@utility` definition in `global.css` stays.
- **`src/middleware.ts`** populates `context.locals.user` for **every** request (via `getClaims()` with a `getUser()` fallback) and only redirects unauthenticated users away from `PROTECTED_ROUTES = ["/dashboard", "/products", "/account"]`. `/` is not in that list, so anonymous requests already pass through. Authenticated users are **not** redirected by the middleware — the page must do that itself. `context.locals.user` is therefore available in `index.astro` frontmatter with no extra query.
- **S-09 (screens-restyle) is already shipped** (commits p1–p4 + epilogue). The whole app renders in the S-08 light system; the design tokens, self-hosted Geist, and shared `Button`/`Badge`/`Card`/`Input`/`Dialog`/`Checkbox` components all exist. The app UI copy is **English** (E2E locks headings `Sign in`, `Dashboard`, `Products`, `Account`).
- **`src/styles/global.css`** defines the S-08 token layer. Type scale is namespaced `--fs-*` (with `--fs-display: 3rem` explicitly commented "48 — landing hero"), shadows `--ds-shadow-*`, tracking `--track-*`, spacing `--space-*`. The shadcn contract (`--background`, `--card`, `--primary`, `--border`, …) is mapped onto the design values. Status colors (`--status-{under,watch,ok,slow,insuff}-{bg,border,fg,solid}`) are exposed as Tailwind utilities.
- **The repo `<Badge>` matches the design-kit Badge API 1:1** (`state`, `tone="accent"`, `dot={false}`, `children`) — the mini-dashboard preview rows map directly onto `<Badge state={…} />` and `<Badge tone="accent" dot={false}>`. `<Button>` has variants `default/destructive/outline/secondary/ghost/link` and sizes `default/sm/lg/icon` — covering the design's primary/`secondary`/`ghost` × `lg`/`sm` usage. There is **no `rightIcon` prop**; icons are passed as children (the Button CSS already sizes `[&_svg]`).
- **Links-as-buttons** already have a house pattern: `dashboard.astro` uses `<a class:list={buttonVariants({ variant })}>`. The Nav/Hero/CTA "buttons" are all navigation, so they are `<a>` links styled with `buttonVariants`, targeting `/auth/signup` and `/auth/signin`.

### Key Discoveries:

- **The design's `--accent` ≠ the repo's `--accent`.** In the design kit, `--accent` is the indigo **action** color (the wordmark tile background, accent badges). In the repo, `global.css:179` deliberately maps shadcn `--accent` to a **muted gray hover surface** (`--gray-100`); the indigo action color lives in `--primary` / `--indigo-600`. So `background: var(--accent)` in the design recipe must translate to `bg-primary` (or `var(--primary)`), **never** `bg-accent`. This is the single most likely mistranslation.
- **Token name deltas** (design → repo): `--text-display`→`--fs-display`, `--text-h1/h2/h3`→`--fs-h1/h2/h3`, `--text-lg/base/sm/xs/2xs`→`--fs-*`, `--tracking-tight/snug/wide`→`--track-*`, `--shadow-lg`→`--ds-shadow-lg`. Repo has no `--radius-2xl` (design uses it on the Final CTA panel) — use the Tailwind `rounded-2xl` utility or `--radius-xl`. Everything else the recipe uses (`--gray-950/400/300/200`, `--accent-subtle`, `--status-ok-solid`, `--status-under-fg`, `--surface`, `--surface-muted`, `--border`, `--text-heading/muted/subtle`, `--link`, `--container`, `--font-mono`, `--num-features`, `--ease-out`) exists in the repo verbatim.
- **The design source is a React `.jsx`-style mockup** (`ui_kits/landing/index.html`), not code to copy. It is a **spec**: translate its structure/copy/tokens into Astro markup + repo Tailwind idiom, same rule S-08/S-09 followed. Icons in the recipe are inline `<svg>` path sets (`Boxes`, `Upload`, `Layers`, `Clipboard-check`, `ArrowRight`, `Check`) — inline them as Astro SVG markup.
- **`Layout.astro` hardcodes `<html lang="en">`** and `title="10x Astro Starter"` default. Since only the landing is Polish (the rest of the app is English), a shared `lang="pl"` would mislabel other pages — so `Layout` gets an optional `lang` prop (default `"en"`, preserving all existing pages) and the landing passes `lang="pl"`.
- **`/` is not currently E2E-tested.** Existing specs: `protected-routes-auth.spec.ts` (unauth → `/auth/signin` redirect for the three protected routes) and `seed.spec.ts` (products flow). The new spec mirrors the `protected-routes-auth` pattern (role locators, wait-on-state, `test.use({ storageState })` to toggle session).

## Desired End State

Visiting `/`:

- **as an anonymous visitor** → renders the StockHelper landing (all five sections) in the light design system, in Polish, with CTAs linking to `/auth/signup` and `/auth/signin`. No redirect.
- **as an authenticated visitor** → 302/redirect to `/dashboard` before any landing markup renders.

`/` remains outside `PROTECTED_ROUTES` (anonymous access preserved). `Welcome.astro` and `Topbar.astro` are deleted. A Playwright spec locks both routing behaviors. `npm run build`, `npm run lint`, `npm run astro check`, `npm test`, and `npx playwright test` all pass.

Verification: the page visually matches `ui_kits/landing` (translated to the repo's light tokens) and the `/design-preview` reference; the accessibility tree exposes the hero heading and the two CTAs by role.

## What We're NOT Doing

- **Not** adding `/` to `PROTECTED_ROUTES` or changing `src/middleware.ts` at all. The redirect is page-level only.
- **Not** changing any auth, API, engine, data, or classification logic. The mini-dashboard preview is a **static mockup** with hardcoded sample rows — it does **not** query real data.
- **Not** translating the rest of the app to Polish. Only the landing is Polish; the app-wide EN→PL migration is future work (S-11 territory). The EN-app / PL-landing split is an accepted transitional state.
- **Not** building any interactivity — no React island on the landing (static content = Astro, per CLAUDE.md). No form, no client JS.
- **Not** removing the `@utility bg-cosmic` definition (still used by `design-preview.astro`) or touching `design-preview.astro`.
- **Not** adding a dark theme, mobile layout (desktop-only per PRD non-goals), or new fonts/tokens (the S-08 layer is sufficient).
- **Not** changing any existing accessible name/role/heading in the already-shipped app (the landing adds new surface; it does not alter existing screens).

## Implementation Approach

Three phases, each independently verifiable. **Phase 1** flips the route: it rewrites `index.astro` (session redirect + landing render), builds the page **shell** (Nav, Hero, Final CTA + footer — the sections that frame the page and carry the CTAs), adds the `lang` prop to `Layout`, and deletes the dead boilerplate. After Phase 1 the routing contract and the primary conversion path are provable. **Phase 2** fills in the two content-rich middle sections (the 3-step "Jak to działa" and the mini-dashboard "Podgląd produktu"). **Phase 3** adds the E2E spec and runs the full suite green.

All sections are `.astro` components under `src/components/landing/`; `index.astro` composes them. All "buttons" are `<a>` links styled with `buttonVariants`. Design recipes are pulled from the `claude_design` MCP and translated to repo tokens; the token-delta table in **Critical Implementation Details** is the translation key. Read the `frontend-design` skill before implementing.

## Critical Implementation Details

- **`--accent` trap.** The design's indigo action color is the repo's `--primary` / `bg-primary`, **not** `bg-accent` (which is a muted gray hover surface in this repo). Every design node using `background: var(--accent)` / accent action color (wordmark tile, primary CTA) maps to `--primary`. Accent-_subtle_ surfaces (accent badge background) map to the existing `--accent-subtle` / `--accent-subtle-fg` (which `<Badge tone="accent">` already uses).
- **Token translation (design → repo):** type `--text-*`→`--fs-*`; tracking `--tracking-*`→`--track-*`; shadow `--shadow-lg`→`--ds-shadow-lg`; `--radius-2xl`→`rounded-2xl` utility. `--gray-*`, `--accent-subtle`, `--status-*`, `--surface*`, `--border`, `--text-heading/muted/subtle`, `--link`, `--container`, `--font-mono`, `--num-features` are identical in the repo. Prefer Tailwind token utilities (`text-foreground`, `bg-card`, `bg-muted`, `text-muted-foreground`, `border-border`) where they map cleanly; drop to `var(--…)` via arbitrary values only for tokens without a utility (e.g. `text-[length:var(--fs-display)]`, `shadow-[var(--ds-shadow-lg)]`).
- **Redirect ordering.** In `index.astro` frontmatter, read `Astro.locals.user` and `return Astro.redirect("/dashboard")` **before** any landing data/markup is prepared. Pages are SSR by default (`output: "server"`) — no `prerender` export needed (that rule is API-routes-only per CLAUDE.md).
- **Static mockup, real components.** The mini-dashboard preview reuses `<Badge state={…} />` for the five states so the pills are pixel-identical to the real dashboard, but its rows are a hardcoded sample array in the `.astro` file — no DB call, no `client:` directive.
- **`lang` prop is additive.** `Layout` gains `lang?: string` defaulting to `"en"`; every existing page keeps `lang="en"` unchanged. Only the landing passes `lang="pl"`.

## Phase 1: Routing + shell + boilerplate removal

### Overview

Flip `/` to the new landing: page-level session redirect, the framing sections (Nav, Hero, Final CTA + footer), the `Layout` `lang` prop, and deletion of the dead boilerplate. After this phase the access contract and the CTA path are provable end-to-end.

### Changes Required:

#### 1. Landing route + session redirect

**File**: `src/pages/index.astro`

**Intent**: Redirect authenticated visitors to `/dashboard`; otherwise render the new landing composed from the section components. Replace the `Welcome` import entirely.

**Contract**: Frontmatter reads `const { user } = Astro.locals` and `if (user) return Astro.redirect("/dashboard")`. Renders `<Layout title="StockHelper — Wiedz, co zamówić" lang="pl">` wrapping `<Nav/>`, `<Hero/>`, `<FinalCta/>` (Phase 2 inserts `<Steps/>` and `<Preview/>` between Hero and FinalCta). No `Welcome` import.

#### 2. Optional page language on the shared layout

**File**: `src/layouts/Layout.astro`

**Intent**: Let a page declare its language without affecting other pages.

**Contract**: Add `lang?: string` to `Props`, default `"en"`; render `<html lang={lang}>`. All existing pages (which pass no `lang`) keep `lang="en"`.

#### 3. Nav section

**File**: `src/components/landing/Nav.astro`

**Intent**: Sticky top bar with the StockHelper wordmark on the left and the two auth CTAs on the right, matching the recipe's `Nav`/`Wordmark`.

**Contract**: Wordmark = indigo (`bg-primary`) rounded tile with the inline `Boxes` SVG + "StockHelper" text. Right side: `Zaloguj` → `/auth/signin` (ghost, `sm`) and `Zarejestruj się` → `/auth/signup` (default, `sm`, trailing `ArrowRight` SVG). Both are `<a class:list={buttonVariants({ variant, size })}>`. Sticky, translucent surface background with bottom border.

#### 4. Hero section

**File**: `src/components/landing/Hero.astro`

**Intent**: Centered hero — eyebrow badge, display heading, one-sentence value prop, CTA pair, and three feature ticks — per the recipe's `Hero`.

**Contract**: `<Badge tone="accent" dot={false}>Dla właścicieli sklepów e-commerce</Badge>`; `<h1>` at `--fs-display` reading "Wiedz, co zamówić w tym tygodniu"; lead paragraph "StockHelper śledzi rotację…"; CTA pair `Zarejestruj się` → `/auth/signup` (default, `lg`) + `Zaloguj` → `/auth/signin` (secondary, `lg`); three check-ticks ("Bez integracji ze sklepem", "5 stanów rotacji", "Plan zamówień co tydzień") using the `Check` SVG in `--status-ok-solid`. The `<h1>` is the E2E anchor for the anon case.

#### 5. Final CTA + footer

**File**: `src/components/landing/FinalCta.astro`

**Intent**: Dark full-width CTA panel plus a footer row, per the recipe's `FinalCta`.

**Contract**: Dark panel (`bg-[var(--gray-950)]`, `rounded-2xl`) with white heading "Zacznij zamawiać z głową", muted subcopy, and one `Zarejestruj się za darmo` → `/auth/signup` CTA (default, `lg`, trailing `ArrowRight`). Footer row: wordmark + "© 2026 StockHelper".

#### 6. Delete dead boilerplate

**Files**: delete `src/components/Welcome.astro` and `src/components/Topbar.astro`.

**Intent**: Remove the now-unreferenced dark boilerplate. Verified: `Welcome` is imported only by `index.astro` (rewritten above); `Topbar` only by `Welcome`.

**Contract**: No remaining import of either file (`grep -r "Welcome\|Topbar" src` returns nothing). `bg-cosmic` `@utility` stays (still used by `design-preview.astro`).

#### 7. Shared icon markup (optional helper)

**File**: `src/components/landing/icons.astro` or inline per section.

**Intent**: House the inline SVG path sets used across sections (`Boxes`, `Upload`, `Layers`, `ClipboardCheck`, `ArrowRight`, `Check`) so Nav/Hero/Steps/Preview share them.

**Contract**: `stroke="currentColor"`, `stroke-width="2"`, `aria-hidden="true"`, sized via `class`/`width`/`height`. Decorative only — no accessible name. (If a single shared file is awkward in `.astro`, inline the SVGs in each section instead — the recipe's `d` attributes are the source.)

### Success Criteria:

#### Automated Verification:

- Build passes: `npm run build`
- Lint passes: `npm run lint`
- Type/astro check passes: `npm run astro check`
- Unit tests pass: `npm test`
- No dead imports: `grep -rn "Welcome\|Topbar" src` returns nothing

#### Manual Verification:

- Anonymous visit to `/` renders the landing (Nav + Hero + Final CTA) in the light system, in Polish; no redirect.
- Authenticated visit to `/` lands on `/dashboard`.
- Hero and Nav CTAs navigate to `/auth/signup` and `/auth/signin`.
- Colors/spacing/type match `ui_kits/landing` (translated) and `/design-preview`; the wordmark tile is indigo (`--primary`), not gray.

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 2.

---

## Phase 2: Content sections (steps + product preview)

### Overview

Add the two content-rich middle sections and slot them into `index.astro` between Hero and Final CTA.

### Changes Required:

#### 1. "Jak to działa" — three steps

**File**: `src/components/landing/Steps.astro`

**Intent**: A left-to-right 3-step sequence (enter sales data → engine classifies velocity → weekly restocking plan), per the recipe's `Steps`.

**Contract**: Section eyebrow "Jak to działa" + `<h2>` "Trzy kroki od danych do decyzji". Three `<Card>` (or token-classed divs) in a 3-col grid, each with: an accent-subtle icon tile (`--accent-subtle` bg, `--accent-subtle-fg`/`--indigo` icon), a mono step number (`01`/`02`/`03` in `--font-mono` + `--num-features`), an `<h3>` title, and body copy — text per the recipe (`Wprowadź dane sprzedaży` / `Silnik klasyfikuje rotację` / `Dostajesz tygodniowy plan`). Between cards, an `ArrowRight` connector (decorative, `aria-hidden`).

#### 2. "Podgląd produktu" — mini-dashboard mockup

**File**: `src/components/landing/Preview.astro`

**Intent**: A two-column section — copy + bullet list on the left, an inline mini-dashboard mockup on the right — per the recipe's `Preview` + `MiniDashboard`.

**Contract**: Left column: eyebrow "Narzędzie w akcji", `<h2>` "Cały katalog na jednym ekranie", paragraph, and a 3-item check bullet list. Right column: a bordered/elevated card with a faux window title bar ("StockHelper · Dashboard") and a hardcoded sample of **five** product rows, one per classification state — `Understocked`, `Watch`, `OK`, `Slow-mover`, `Insufficient data` mapped through `<Badge state={…} />` — with a recommendation label per row (`Zamów X szt.` colored `--status-under-fg` for restock rows, muted otherwise). Static data array in the file; no query, no `client:` directive.

#### 3. Compose into the page

**File**: `src/pages/index.astro`

**Intent**: Insert the two sections in reading order.

**Contract**: Render order Nav → Hero → Steps → Preview → FinalCta.

### Success Criteria:

#### Automated Verification:

- Build passes: `npm run build`
- Lint passes: `npm run lint`
- Type/astro check passes: `npm run astro check`
- Unit tests pass: `npm test`

#### Manual Verification:

- The 3-step section renders in order with icons, mono numbers, and arrow connectors.
- The mini-dashboard shows all five states with the correct badge hue per state; restock rows show the `Zamów …` recommendation in the under-stock color.
- Full page top-to-bottom matches `ui_kits/landing` (translated); no horizontal scroll at desktop widths.

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 3.

---

## Phase 3: E2E coverage + full verification

### Overview

Lock the routing contract with a Playwright spec and run the whole suite green.

### Changes Required:

#### 1. Landing + redirect E2E spec

**File**: `e2e/landing.spec.ts`

**Intent**: Assert the two behaviors that the slice's routing trap threatens — anonymous visitors see the landing at `/`, authenticated visitors are redirected to `/dashboard`.

**Contract**: Modeled on `e2e/protected-routes-auth.spec.ts` (role locators, wait-on-state, never `waitForTimeout`).

- Anonymous block: `test.use({ storageState: { cookies: [], origins: [] } })`; `page.goto("/")`; assert the hero heading is visible by role and the URL stayed `/` (no redirect).
- Authenticated block: uses the project-level authenticated `storageState` (from `playwright.config.ts`); `page.goto("/")`; `await page.waitForURL("**/dashboard")`; assert the `Dashboard` heading is visible.

Give the hero `<h1>` a stable, role-locatable accessible name (a substring of the Polish heading) — decide the exact locator string against the rendered heading, and keep it byte-stable thereafter.

### Success Criteria:

#### Automated Verification:

- Build passes: `npm run build`
- Lint passes: `npm run lint`
- Type/astro check passes: `npm run astro check`
- Unit tests pass: `npm test`
- Full E2E suite green: `npx playwright test` (dev server on :4321; `playwright/.auth/user.json` is a live session — refresh if expired, as noted for the S-09 gate)

#### Manual Verification:

- The new spec passes in isolation both anonymous and authenticated (`npx playwright test e2e/landing.spec.ts`).
- No regression in `protected-routes-auth.spec.ts` or `seed.spec.ts`.

**Implementation Note**: After all automated verification passes, pause for final manual confirmation.

---

## Testing Strategy

### Unit Tests:

- None required — the landing is static presentation with no logic to unit-test. Existing unit suites must stay green (regression guard).

### Integration / E2E Tests:

- `e2e/landing.spec.ts` (Phase 3): anonymous `/` renders hero + no redirect; authenticated `/` → `/dashboard`.

### Manual Testing Steps:

1. Logged out, open `/` — confirm all five sections render in the light system, in Polish, desktop layout, no horizontal scroll.
2. Click `Zarejestruj się` / `Zaloguj` — confirm they reach `/auth/signup` / `/auth/signin`.
3. Log in, open `/` — confirm redirect to `/dashboard`.
4. Compare against `ui_kits/landing` (via `claude_design` MCP) and `/design-preview` — colors, type scale, spacing, the indigo wordmark tile.

## Performance Considerations

Static SSR page, zero client JS (no islands). The redirect short-circuits before landing markup for authenticated users. No new fonts or assets beyond the already-loaded S-08 Geist + tokens.

## Migration Notes

- `Welcome.astro` + `Topbar.astro` are deleted (dead after the rewrite). `bg-cosmic` `@utility` is intentionally retained for `design-preview.astro`.
- The EN-app / PL-landing split is a deliberate transitional state; the app-wide Polish migration is future work (S-11).

## References

- Roadmap slice: `context/foundation/roadmap.md` § S-10
- Design source: Claude Design project `a1fc2530-a078-42b2-a0ae-501b94b777a0` → `ui_kits/landing/{index.html,README.md}` (via `claude_design` MCP)
- Frontend design guidance: `frontend-design` skill (read before implementing)
- Prior UI slice (token translation + Astro/React boundary precedent): `context/changes/screens-restyle/plan.md`
- Token layer: `src/styles/global.css`
- Route guard (do NOT modify): `src/middleware.ts:4` (`PROTECTED_ROUTES`), `src/middleware.ts:32`
- E2E pattern to mirror: `e2e/protected-routes-auth.spec.ts`
- Components: `src/components/ui/{button,badge,card}.tsx`; links-as-buttons precedent `src/pages/dashboard.astro:47`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Routing + shell + boilerplate removal

#### Automated

- [x] 1.1 Build passes: `npm run build` — 56abd5a
- [x] 1.2 Lint passes: `npm run lint` — 56abd5a
- [x] 1.3 Type/astro check passes: `npm run astro check` — 56abd5a
- [x] 1.4 Unit tests pass: `npm test` — 56abd5a
- [x] 1.5 No dead imports: `grep -rn "Welcome\|Topbar" src` returns nothing — 56abd5a

#### Manual

- [ ] 1.6 Anonymous `/` renders landing (Nav + Hero + Final CTA), light system, Polish, no redirect
- [ ] 1.7 Authenticated `/` lands on `/dashboard`
- [ ] 1.8 Nav/Hero CTAs navigate to `/auth/signup` and `/auth/signin`
- [ ] 1.9 Visual match to `ui_kits/landing` + `/design-preview`; wordmark tile is indigo (`--primary`)

### Phase 2: Content sections (steps + product preview)

#### Automated

- [x] 2.1 Build passes: `npm run build` — d985c2d
- [x] 2.2 Lint passes: `npm run lint` — d985c2d
- [x] 2.3 Type/astro check passes: `npm run astro check` — d985c2d
- [x] 2.4 Unit tests pass: `npm test` — d985c2d

#### Manual

- [ ] 2.5 3-step section renders in order with icons, mono numbers, arrow connectors
- [ ] 2.6 Mini-dashboard shows all five states with correct badge hue; restock rows show `Zamów …` in under-stock color
- [ ] 2.7 Full page matches `ui_kits/landing` (translated); no horizontal scroll at desktop widths

### Phase 3: E2E coverage + full verification

#### Automated

- [x] 3.1 Build passes: `npm run build`
- [x] 3.2 Lint passes: `npm run lint`
- [x] 3.3 Type/astro check passes: `npm run astro check`
- [x] 3.4 Unit tests pass: `npm test`
- [x] 3.5 Full E2E suite green: `npx playwright test`

#### Manual

- [ ] 3.6 `e2e/landing.spec.ts` passes both anonymous and authenticated in isolation
- [ ] 3.7 No regression in `protected-routes-auth.spec.ts` or `seed.spec.ts`
