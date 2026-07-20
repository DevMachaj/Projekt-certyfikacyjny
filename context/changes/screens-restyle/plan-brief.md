# Screens Restyle (S-09) — Plan Brief

> Full plan: `context/changes/screens-restyle/plan.md`

## What & Why

S-08 built the light design system (tokens + Geist + `button`/`card`/`input`/`badge`/`dialog`/`checkbox`), provable on `/design-preview` — but the real screens still **override** those tokens with hardcoded dark "cosmic" classes, so the shipped app still looks dark. S-09 is the visible cutover: apply S-08 to the actual screens and wire the built-but-unused `<Badge>`.

## Starting Point

Every screen hardcodes dark styling: `bg-cosmic` page backgrounds (9 files), `rounded-2xl border-white/10 bg-white/5` cards (~10 sites), `bg-purple-600` submit/action buttons (6 sites), gradient `<h1>`s, and `DialogContent bg-slate-900`. The single raw `<input>` lives in `FormField.tsx` (used by every form). `<Badge>` exists but is wired nowhere; `classification-ui.ts` `STATE_STYLES` is already S-08-tokenized (S-09 doesn't touch it).

## Desired End State

All in-scope screens (dashboard, products list, product detail, product/sales forms, restocking plan, account, auth) render in the S-08 light system — no `bg-cosmic`/`bg-white/5`/`bg-purple-600`/gradient headings — using tokens, `Button` variants, `<Card>` (or token classes in `.astro`), a tokenized `FormField`, S-08 dialogs, and `<Badge>` at its two status sites. The Playwright E2E suite passes **fully green**, accessibility tree byte-identical.

## Key Decisions Made

| Decision      | Choice                                     | Why                                                                                                                                                   | Source |
| ------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Phase split   | **By screen, 4 phases**                    | Spec's "split BY SCREEN"; each screen independently verifiable with its own E2E gate                                                                  | Plan   |
| Shared chrome | **Rides with Dashboard (Phase 1)**         | Topbar / bg-swap / heading pattern are needed first on the dashboard; keeps every phase a real screen                                                 | Plan   |
| Scope         | **Include account + auth**                 | Restyling shared `FormField` cascades there anyway; covers all four E2E headings; avoids half-restyled look                                           | Plan   |
| FormField     | **Restyle in place (class-only)**          | Lowest E2E risk — the `htmlFor`/`id` label↔input linchpin all `getByLabel` selectors depend on is never touched                                       | Plan   |
| Cards         | **`<Card>` in `.tsx`, tokens in `.astro`** | Avoids forcing React `<Card>` onto the `ProductCard` `<a>` link or into Astro static render                                                           | Plan   |
| E2E gate      | **Refresh fixture, full green per phase**  | `seed.spec` is exactly the Add-product/Name/Stock-quantity/Delete flow — the most relevant guard; S-08's 4/5 was an expired fixture, not a regression | Plan   |

## Scope

**In scope:** dashboard + `ProductCard` + `RestockingPlan`; products list + `ProductCatalog` + delete dialogs; product detail + `ProductDetail` + `ClassificationPanel` + `SalesEntryForm`; `ProductForm`; shared `Topbar` + `FormField` + per-page `bg-cosmic` swap + gradient-heading swap; account + danger zone + delete-account dialog; auth pages (signin/signup/confirm-email); wire `<Badge>` at its 2 sites.

**Out of scope:** any island logic / API / engine change; `classification-ui.ts` (already tokenized); rewiring/replacing `FormField`; `/design-preview`; S-10 landing (`Welcome.astro`/`index.astro`); dead-code cleanup; dark theme/toggle; removing the `bg-cosmic` `@utility` definition.

## Architecture / Approach

Per screen phase: swap the page's `bg-cosmic` wrapper → light background; replace dark classes with tokens; migrate card divs to `<Card>` (`.tsx`) or token classes (`.astro`); drop `bg-purple-*` `Button` overrides so S-08 variants show; keep every accessible name/role/label/type/route byte-identical; run automated checks + full E2E; pause for manual sign-off. FormField is tokenized in Phase 2 (first form screen) and cascades to auth/account, finalized in Phase 4. Design recipes pulled from the Claude Design project via the `claude_design` MCP.

## Phases at a Glance

| Phase                    | What it delivers                                                  | Key risk                                                                                                                                       |
| ------------------------ | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Dashboard + shell     | Light dashboard, Topbar, bg/heading patterns, `<Badge>` on cards  | Shared chrome touches several files; keep the four `<a>`/button texts + `Sign out` form intact                                                 |
| 2. Products list + forms | Light products list, dialogs, tokenized `FormField`, product form | `seed.spec` locks Add-product dialog name, `Name` textbox, `Stock quantity` spinbutton, `Delete <name>` — FormField association must not shift |
| 3. Product detail        | Light detail, sales form, classification panel + `<Badge>`        | Badge swap must preserve the visible state text; keep dynamic delete-entry aria-label                                                          |
| 4. Account + auth        | Light account/danger zone/dialog + auth pages                     | `Sign in` / `Account` headings + `/auth/signin` route are E2E-load-bearing                                                                     |

**Prerequisites:** S-08 done (✓); refresh `playwright/.auth/user.json` (live local Supabase session) before Phase 1; `claude_design` MCP access (`/design-login`) for exact recipes; local dev on :4321 for the E2E gate.
**Estimated effort:** ~4 sessions, one per phase.

## Open Risks & Assumptions

- **E2E stability is the dominant risk** — a restyle that renames/removes an accessible name, role, label, or `type` silently breaks a `getByRole`/`getByLabel` locator. Guardrail: class/markup-attribute edits only; the load-bearing strings are enumerated per phase.
- Transient cross-phase inconsistency (auth/account get tokenized inputs in P2 but keep dark shells until P4) is expected, not a bug.
- `<Card>` is React-only; `.astro` sites (incl. the `ProductCard` `<a>` link) use equivalent token utilities instead.
- The E2E gate needs a manually refreshed auth fixture + a running dev server (no `webServer` in `playwright.config.ts`).

## Success Criteria (Summary)

- Every in-scope screen renders in the S-08 light system, matching the design `ui_kits/app` / `/design-preview` — no residual `bg-cosmic`/`bg-white/5`/`bg-purple-600`/gradient headings.
- `<Badge>` shows the muted status pill at both sites with unchanged state text; forms/dialogs/buttons use S-08 components.
- `npm run build` / `lint` / `astro check` / `test` green; `npx playwright test` **fully green** — no accessible-name/role/label/heading/route/`type` regression.
