# Screens Restyle (S-09) Implementation Plan

## Overview

Apply the **S-08 light design system** to the real application screens. S-08 (`design-system-refresh`) built and shipped the token layer (`src/styles/global.css`), self-hosted Geist, and the shared shadcn base library (`button`, `dialog`, `checkbox`, `card`, `input`, `badge`) — provable on `/design-preview` — but the actual screens still **override those tokens** with hardcoded dark/"cosmic" classes, so the shipped app still looks dark. S-09 is the visible cutover: remove the hardcoded dark styling (`bg-cosmic`, `bg-white/5`, `border-white/10`, `bg-purple-600`, gradient headings) from the screens so they render in the S-08 light system, and wire the built-but-unused `<Badge>` into its two render sites.

**Hard boundary — visual layer only.** No React island logic changes, no API changes, no engine/threshold changes. Every accessible name, ARIA role, heading text, form label, `type="number"`, and route is preserved verbatim so the Playwright E2E suite stays green. The slice is verifiable as "pixels moved, accessibility tree unchanged."

## Current State Analysis

S-08 is complete and merged (statuses `impl_reviewed`). The token contract and components exist; screens do not consume them yet. Precise inventory (from a full read of every screen file):

**Shared / cross-cutting:**

- `src/layouts/Layout.astro` is a **thin shell** — `<head>` + config `Banner` + `<slot/>`, no background and no Topbar. Each **page** owns its own `bg-cosmic min-h-screen` wrapper and includes chrome individually. So the "app background" is per-page, not centralized.
- `bg-cosmic` is a bespoke dark-gradient `@utility` defined once in `src/styles/global.css:301`, **used by 9 files** — `dashboard.astro`, `products.astro`, `products/[id].astro`, `account.astro`, `auth/{signin,signup,confirm-email}.astro`, `Welcome.astro` (landing — S-10, out of scope), and `design-preview.astro` (dev reference — leave).
- The **gradient-heading pattern** `bg-gradient-to-r from-blue-200 to-purple-200 bg-clip-text ... text-transparent` appears on the `<h1>`s of `dashboard.astro:40`, `ProductCatalog.tsx:202`, `account.astro:16`, and the three `auth/*` pages.
- `src/components/Topbar.astro` — shared top bar: `rounded-xl border border-white/10 bg-white/5 text-white/80` (L6), `text-blue-100/70` (L11,25), `text-purple-300` links (L13,17,27,30), raw `<button type="submit">Sign out` (L16-20).
- `src/components/auth/FormField.tsx` — the **single raw `<input>`** behind every form (products, sales, account, auth). Hardcoded `inputBase` (L5-6: `bg-white/10 border ... text-white placeholder-white/40 focus:ring-2`), label `text-blue-100/80` (L37), icon `text-white/40` (L41), conditional `border-red-400/60 / border-white/20 focus:ring-purple-400` (L53), error `text-red-300` (L59). **Label↔input association is `<label htmlFor={id}>` (L37) ↔ `<input id={id} name={name ?? id} type={type}>` (L42-46)** — the linchpin every `getByLabel` selector depends on.

**Recurring hardcoded patterns:**

- **Card pattern** `rounded-2xl border border-white/10 bg-white/5 p-6` (and `p-12` empty-state variant): `RestockingPlan.tsx:52`, `ProductCatalog.tsx:229,243,288`, `ProductDetail.tsx:105,110,139`, `ClassificationPanel.tsx:51`, `dashboard.astro:88`, `products/[id].astro:52`, `ProductCard.astro:18`. Danger variant `border-red-500/30 bg-red-900/10` at `AccountDangerZone.tsx:51`.
- **Dialog pattern** `DialogContent border-white/10 bg-slate-900 text-white` + Cancel `Button` override `border-white/20 bg-white/10 text-white hover:bg-white/20`: `ProductCatalog.tsx:350`, `DeleteProductDialog.tsx:33,48`, `BulkDeleteDialog.tsx:36,51`, `ProductDetail.tsx:170,189`, `DeleteAccountDialog.tsx:50,79`.
- **Purple submit-button override** `bg-purple-600 ... hover:bg-purple-500 text-white`: `ProductForm.tsx:123`, `SalesEntryForm.tsx:106`, `ProductCatalog.tsx:205,235`, `dashboard.astro:50,95`.
- **Status-badge render sites** (raw `<span>`/`<li>` using `STATE_STYLES` — already S-08-tokenized in `classification-ui.ts`, only the wrapper markup is raw): `ProductCard.astro:22-24` and `ClassificationPanel.tsx:54` (+ threshold ladder `91-96`). `<Badge>` (built in S-08) is **not yet wired anywhere**.

### Key Discoveries:

- **E2E contract** (`e2e/seed.spec.ts`, `e2e/protected-routes-auth.spec.ts`; zero style assertions) — must be preserved verbatim:
  - `getByRole("dialog", { name: "Add product" })`; `getByRole("button", { name: "Add product" })`.
  - `getByRole("textbox", { name: "Name" })`; `getByRole("spinbutton", { name: "Stock quantity" })` (requires `type="number"` at `ProductForm.tsx:80`).
  - Product rows are `link` role: `getByRole("link", { name: productName })` (`ProductCatalog.tsx:300`, `ProductCard.astro:16`).
  - `getByRole("button", { name: `Delete ${productName}` })` (`ProductCatalog.tsx:332`).
  - Headings as heading elements: `Sign in`, `Dashboard`, `Products`, `Account`.
  - Route `/auth/signin`; `PROTECTED_ROUTES` = `/dashboard`, `/products`, `/account`.
- **`seed.spec.ts` is exactly the products/forms flow** (open Add-product dialog → fill Name + Stock quantity → submit → row appears as link → reload → Delete). It is the most relevant gate for Phases 2–3.
- **The S-08 E2E gate ran 4/5** — the one failure was `seed.spec` hitting an **expired** `playwright/.auth/user.json` (Jun 27 session → 302), not a regression. S-09 refreshes that fixture once so the full suite is a real green baseline.
- **`playwright.config.ts` has no `webServer`** — running the suite means: start `npm run dev` (port 4321), ensure `playwright/.auth/user.json` is a live session, then `npx playwright test`.
- **The S-08 `<Card>` is React (`.tsx`)**; `.astro` files render React components only as static markup, and `ProductCard.astro`'s card is an `<a>` link. Decision: use `<Card>` at `.tsx` sites; apply the equivalent token utility classes to `.astro` card divs / the `ProductCard` `<a>`.
- **`classification-ui.ts` is already tokenized** (S-08) — S-09 does **not** touch it; it only replaces the raw `<span>` wrappers at the two render sites with `<Badge>` (which consumes the same `STATE_STYLES`).
- Design source of truth: Claude Design project `a1fc2530-a078-42b2-a0ae-501b94b777a0` (`ui_kits/app`, `components/*`, `guidelines/*`), read via the `claude_design` MCP for exact per-screen recipes.

## Desired End State

All in-scope screens render in the S-08 light system with **no** hardcoded dark/cosmic classes:

- Dashboard, products list, product detail, product & sales forms, restocking plan, account, and auth pages use `bg-background`/`bg-card`/token foregrounds, the S-08 `Button` (default/outline/ghost/destructive keys, no purple overrides), `<Card>` (or token-classed divs in `.astro`), tokenized `FormField` inputs, S-08 `Dialog` surfaces, and `<Badge>` at the two status sites.
- `bg-cosmic` is removed from every in-scope page (replaced with the light app background); the gradient-heading pattern is replaced with a solid token color on all in-scope `<h1>`s.
- The Playwright E2E suite passes **fully green** (fixture refreshed): no accessible-name/role/label/heading/route/`type` regression.

Verification: each screen visually matches the design project (`ui_kits/app` + `/design-preview` reference); `npm run build`, `npm run lint`, `npm run astro check`, `npm test`, and `npx playwright test` all pass per phase.

## What We're NOT Doing

- **Not** changing any React island logic, event handler, state, data fetch, or hook. Class/markup-attribute edits only.
- **Not** changing any API route, engine (`classification.ts`), threshold, or `classification-ui.ts` (already tokenized — only its two render sites get `<Badge>`).
- **Not** changing `FormField`'s API, its `htmlFor`/`id`/`name ?? id`/`type` passthrough, or the label↔input association. FormField is **restyled in place** (class swap), not rewired onto `ui/input.tsx` and not replaced at call sites.
- **Not** renaming or removing any accessible name, ARIA role, heading text, aria-label, form label, placeholder-as-name, or route.
- **Not** building the S-10 landing page or restyling `Welcome.astro` / `index.astro`.
- **Not** touching `/design-preview.astro` (dev reference) or cleaning dead code (`LibBadge.astro`, `Banner.astro`).
- **Not** removing the `bg-cosmic` `@utility` definition itself in early phases (it stays defined while pages migrate off it); optional removal only after the last in-scope page stops using it (`Welcome.astro`/S-10 still references it, so likely leave it).
- **Not** adding a dark theme or theme toggle.

## Implementation Approach

Four phases, split **by screen** so each is independently verifiable and the full E2E suite runs as a per-phase gate. Phase 1 restyles the Dashboard and, riding along with it, the shared chrome (`Topbar`, the page-background swap pattern, the gradient-heading→solid pattern) plus wires `<Badge>` at its dashboard render site. Phase 2 does the Products list and, because it is the first screen with a form, restyles the shared `FormField` primitive in place (which then cascades correct inputs to auth/account, finalized in Phase 4). Phase 3 does the Product detail and the second `<Badge>` site. Phase 4 finishes Account + auth page shells.

Each screen phase: (1) swap the page's `bg-cosmic` wrapper to the light app background; (2) replace hardcoded dark classes with tokens; (3) migrate raw card divs to `<Card>` (`.tsx`) or token classes (`.astro`); (4) drop `bg-purple-*` `Button` overrides so the S-08 variants show; (5) leave every accessible name/role/label/type/route byte-identical; (6) run automated checks + the full E2E gate; (7) pause for manual visual sign-off.

## Critical Implementation Details

- **Accessibility tree is frozen.** For every edit, the only things that may change are `class`/`className` values, decorative markup (wrappers, icons already `aria-hidden`), and color-bearing style. Never touch: `<label>` text, `htmlFor`/`id`, `name`, `type`, `aria-label`, `aria-live`, heading levels/text, link `href`s, `DialogTitle` text, or button text (including pending-state strings like `Saving...`). The exact E2E-load-bearing strings are enumerated per phase.
- **FormField restyle is class-only.** Swap the `inputBase` constant and the conditional error/border classes to S-08 tokens (`bg-transparent border-input text-foreground placeholder:text-muted-foreground focus-visible:ring-ring`, error → `border-destructive`/`ring-destructive`). Keep the `pl-10` icon inset and the `<label htmlFor={id}>` / `<input id={id} name={name ?? id} type={type}>` structure exactly. Do not import `ui/input.tsx`.
- **Page-background swap is per-page.** Replace each page's `bg-cosmic min-h-screen` wrapper with the light app background (e.g. `bg-background min-h-screen` or the design's app-shell background). Do this in the page's own phase (not globally) so an E2E regression bisects to one screen. Leave the `@utility bg-cosmic` defined (still used by out-of-scope `Welcome.astro`/`design-preview`).
- **`<Card>` in React, tokens in `.astro`.** Use the S-08 `<Card>` composable at `.tsx` sites. In `.astro` (`dashboard.astro`, `products/[id].astro`, `ProductCard.astro`) apply the equivalent token utilities (`bg-card text-card-foreground border border-border rounded-lg shadow-sm`) directly — do not force `<Card>` onto the `ProductCard` `<a>` link or into Astro static render.
- **Badge wiring keeps the text node.** Replacing the raw `<span>{state}</span>` with `<Badge state={state} />` must still render the same visible text (`{classification.state}` / `{state}`) as the accessible content — Badge takes the state and renders the label; verify the rendered text string is unchanged. The threshold-ladder highlight in `ClassificationPanel.tsx:91-96` can keep using `STATE_STYLES` directly (it is not a pill) — restyle only if it currently reads dark.
- **E2E gate = full green on a refreshed fixture.** Before Phase 1, refresh `playwright/.auth/user.json` against a live local Supabase session so `seed.spec` passes. Then every phase's gate is `npx playwright test` fully green (dev server on :4321). `seed.spec` is the primary guard for Phases 2–3; `protected-routes-auth.spec` guards the `Dashboard`/`Products`/`Account`/`Sign in` headings for Phases 1/2/4.
- **Design recipes via MCP.** Pull the exact per-screen visual recipes from the Claude Design project (`a1fc2530-…`, `ui_kits/app` + `components/*`) through the `claude_design` MCP during implementation; translate them into the repo's token/Tailwind idiom (the design `.jsx` are specs, not code to copy — same rule as S-08).

---

## Phase 1: Dashboard + shared app shell

### Overview

Restyle the Dashboard screen and, riding with it, the shared chrome used across screens: `Topbar`, the per-page background swap pattern, and the gradient-heading→solid-token pattern. Wire `<Badge>` at the dashboard status site (`ProductCard.astro`).

### Changes Required:

#### 1. Shared top bar

**File**: `src/components/Topbar.astro`

**Intent**: Replace the dark bar surface and purple links with S-08 tokens (card/surface background, token foreground, primary/foreground link colors), keeping the structure and the `Sign out` submit form.

**Contract**: Classes only. Preserve: `href="/dashboard"` link text `Dashboard` (L13), `<button type="submit">Sign out` inside `<form method="POST" action="/api/auth/signout">` (L16-20), `Sign in`/`Sign up` links (L27-32), `{user.email}` / `Not signed in` spans. No markup/role change.

#### 2. Dashboard page

**File**: `src/pages/dashboard.astro`

**Intent**: Swap `bg-cosmic`→light app background; replace the gradient `<h1>` with a solid token heading; convert the four raw `<a>`/`<button>` "buttons" (Manage products, Account, Sign out, Add your first product) to S-08 `Button` styling (via `buttonVariants` classes on the anchors / the shadcn `Button` where it is a real button); convert the empty-state card to token classes.

**Contract**: Classes/wrapper only. Preserve verbatim: `<h1>Dashboard`, `Signed in as {user.email}`, link texts `Manage products` (→`/products`), `Account` (→`/account`), `Add your first product` (→`/products`), the `Sign out` submit button + its `/api/auth/signout` form, the `<h2>{group.state}` group headings, and empty-state copy `No products yet` / description.

#### 3. Dashboard product card + Badge wiring

**File**: `src/components/dashboard/ProductCard.astro`

**Intent**: Convert the link-card `<a>` from `bg-white/5` to token classes (`bg-card border-border ...`, keep it an `<a>`); replace the raw status `<span>` (L22-24) with `<Badge state={classification.state} />` rendering the same state text.

**Contract**: Preserve: the `<a href={`/products/${product.id}`}>` link (role + dynamic name = `{product.name}` at L21), the badge's visible text `{classification.state}`, and the `{action}` recommendation text. `<Badge>` used as static markup in `.astro`.

#### 4. Restocking plan panel

**File**: `src/components/dashboard/RestockingPlan.tsx`

**Intent**: Replace the section card and nested rows with `<Card>` / token classes; retokenize the error banner (`red-*/20`→`destructive`-tinted or `status`), the fallback banner (`amber-*`→a warning/`status` treatment), the skeleton shimmer (`bg-white/10`→`bg-muted`), and text colors. The `Generate` `Button` already has no override — leave.

**Contract**: Classes only. Preserve: `<h2>Weekly restocking plan`, description copy, `Button` text `Generate weekly restocking plan` / `Generating…`, `aria-hidden` on the `Sparkles`/`Loader2`/skeleton, `Nothing to reorder this week.`, `AI summary unavailable — showing a basic plan.`, and all dynamic `{plan.*}`/`{item.*}` text. No logic/state change.

### Success Criteria:

#### Automated Verification:

- Build passes: `npm run build`
- Lint passes: `npm run lint`
- Typecheck passes: `npm run astro check`
- Unit tests pass: `npm test`
- E2E suite passes fully: `npx playwright test` (dev server :4321 + refreshed `playwright/.auth/user.json`)

#### Manual Verification:

- Dashboard renders in the light system (no dark background, no gradient heading, no purple buttons); matches the design `ui_kits/app` dashboard reference.
- The status badge on each product card shows the S-08 muted `<Badge>` with unchanged state text.
- Topbar renders light wherever it appears; `Sign out` still posts to `/api/auth/signout`.
- No visible change to loading/skeleton behavior (NFR-001: loading states still visible).

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 2.

---

## Phase 2: Products list + product form + delete dialogs

### Overview

Restyle the products list screen and its dialogs, and restyle the shared `FormField` input primitive in place (first form-bearing screen). This is the phase most directly guarded by `seed.spec`.

### Changes Required:

#### 1. Shared input primitive (restyle in place)

**File**: `src/components/auth/FormField.tsx`

**Intent**: Swap the hardcoded `inputBase`, label, icon, error, and conditional border/ring classes to S-08 tokens. Do **not** change structure or props.

**Contract**: Class-only. Preserve exactly: `<label htmlFor={id}>{label}</label>` (L37) and `<input id={id} name={name ?? id} type={type} ...>` (L42-46) — the label↔input association and `type` passthrough that every `getByLabel`/`spinbutton`/`textbox` selector relies on. Keep the `pl-10` icon inset behavior.

#### 2. Products list

**File**: `src/components/products/ProductCatalog.tsx`

**Intent**: Replace the gradient `<h1>`, the `bg-purple-600` Add-product buttons, the empty-state / bulk-action / list-row cards, the list-error banner, the product link and edit/delete icon-button color overrides, and the inline `Dialog` content surface — all with S-08 tokens/`Button` variants/`<Card>`.

**Contract**: Classes only. Preserve verbatim: `<h1>Products`; `Button` text `Add product` (L205) and `Add your first product` (L233); the edit/add `<DialogTitle>` `Edit product` / `Add product` (L352, → dialog accessible name `Add product`); `aria-label="Dismiss error"` (L215); `Checkbox` `aria-label="Select all products"` (L245) and `aria-label={`Select ${product.name}`}` (L291); the `aria-live="polite"` count span; `Clear selection` / `Delete selected` button text; product `<a href={`/products/${product.id}`}>{product.name}` (L300, link role + name); `Stock: …` metadata; `Button aria-label={`Edit ${product.name}`}` (L314) and `Button aria-label={`Delete ${product.name}`}` (L325). Drop `bg-purple-*` overrides so default/destructive/ghost variants show.

#### 3. Delete dialogs

**File**: `src/components/products/DeleteProductDialog.tsx`, `src/components/products/BulkDeleteDialog.tsx`

**Intent**: Replace `DialogContent bg-slate-900 text-white` with the S-08 dialog surface (token background, `bg-black/50`→design scrim already handled by the S-08 `Dialog`) and drop the Cancel `Button` `bg-white/10` override so the `outline` variant shows. Retokenize the destructive icon.

**Contract**: Classes only. Preserve: `<DialogTitle>` `Delete {product?.name}?` / `Delete {count} product(s)?`; the `<DialogDescription>` copy; `Button` text `Cancel` and `Delete product` / `Delete {count} …` (incl. `Deleting...`). No API change.

#### 4. Products page shell + product form

**File**: `src/pages/products.astro`, `src/components/products/ProductForm.tsx`

**Intent**: `products.astro` — swap `bg-cosmic`→light background. `ProductForm.tsx` — drop the `bg-purple-600` submit override (L123) so the default `Button` variant shows; inputs already restyled via `FormField`.

**Contract**: Classes only. Preserve: `<Layout title="Products">`; every `FormField` `label`/`id`/`type` — `Name` (id `name`), `Stock quantity` (id `stock_quantity`, `type="number"`), `Lead time (days)`, `Buffer days` (all `type="number"`); submit `Button` text `Add product` / `Save changes` / `Saving...`; placeholders `e.g. Blue ceramic mug`, `0`.

### Success Criteria:

#### Automated Verification:

- Build passes: `npm run build`
- Lint passes: `npm run lint`
- Typecheck passes: `npm run astro check`
- Unit tests pass: `npm test`
- E2E suite passes fully: `npx playwright test` — **including `seed.spec`** (Add product dialog by name, `textbox` "Name", `spinbutton` "Stock quantity", row as `link`, `Delete <name>`).

#### Manual Verification:

- Products list renders in the light system; Add-product / edit / delete / bulk flows visually match the design; no purple buttons.
- The Add/Edit product dialog opens on the S-08 surface; inputs render tokenized (`Name` textbox, `Stock quantity` spinbutton) with labels intact.
- Auth + account pages (which share `FormField`) now show tokenized inputs on their still-dark shells — expected transient state, finalized in Phase 4.

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 3.

---

## Phase 3: Product detail + sales entry + classification

### Overview

Restyle the `/products/[id]` detail screen: the page shell, `ProductDetail`, the sales-entry form, and `ClassificationPanel` (second `<Badge>` site).

### Changes Required:

#### 1. Detail page shell

**File**: `src/pages/products/[id].astro`

**Intent**: Swap `bg-cosmic`→light background; retokenize the back-link and the not-found card.

**Contract**: Classes only. Preserve: `<a href="/products">← Back to products` (link role + text, L37-42); `<Layout title={…}>`; not-found copy `Product not found`; the `<ProductDetail client:load>` island mount (unchanged).

#### 2. Product detail

**File**: `src/components/sales/ProductDetail.tsx`

**Intent**: Convert the two `<section>` cards and the sales-entry `<li>` rows to `<Card>`/token classes; retokenize the error banner and dismiss button; replace the delete `Button` color override with the `destructive`/`ghost` variant; restyle the delete-entry `Dialog` surface + Cancel override.

**Contract**: Classes only. Preserve: `<h3>Log a sales entry`, `<h3>Sales entries`; `aria-label="Dismiss error"`; `aria-label={`Delete entry ${entry.start_date} to ${entry.end_date}`}` (L154); `<DialogTitle>Delete this sales entry?`; `Button` text `Cancel` / `Delete entry` / `Deleting...`; empty-state copy.

#### 3. Classification panel + Badge wiring

**File**: `src/components/sales/ClassificationPanel.tsx`

**Intent**: Convert the section card, recommendation callout, and `<details>` panel to `<Card>`/token classes; replace the primary status `<span>` (L54) with `<Badge state={state} />`; retokenize text colors. Threshold-ladder highlight (L91-96) keeps `STATE_STYLES` (not a pill) — restyle only if it reads dark.

**Contract**: Classes only. Preserve: `<h2>{product.name}`; `<dt>` labels `Velocity`, `Days of stock`, `History`, `Units sold`; `<summary>What do the states mean?`; the badge's visible state text `{state}`.

#### 4. Sales entry form

**File**: `src/components/sales/SalesEntryForm.tsx`

**Intent**: Drop the `bg-purple-600` submit override (L106) so the default `Button` shows; inputs already restyled via `FormField`.

**Contract**: Classes only. Preserve: `FormField` labels/ids/types — `Units sold` (`type="number"`), `Start date`/`End date` (`type="date"`); submit `Button` text `Log sales entry` / `Saving...`; placeholder `e.g. 12`.

### Success Criteria:

#### Automated Verification:

- Build passes: `npm run build`
- Lint passes: `npm run lint`
- Typecheck passes: `npm run astro check`
- Unit tests pass: `npm test`
- E2E suite passes fully: `npx playwright test`

#### Manual Verification:

- Detail screen (classification panel, sales entries, forms, dialogs) renders in the light system and matches the design.
- The classification status `<Badge>` shows the S-08 muted look with unchanged state text; the threshold ladder is legible.
- Sales-entry add/delete visual flow works; loading/disabled states still visible.

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 4.

---

## Phase 4: Account + auth pages

### Overview

Finish the two remaining screen families that share `FormField` (already tokenized in Phase 2): the Account page + danger zone + delete-account dialog, and the auth pages (sign in / sign up / confirm email).

### Changes Required:

#### 1. Account page + danger zone

**File**: `src/pages/account.astro`, `src/components/account/AccountDangerZone.tsx`, `src/components/account/DeleteAccountDialog.tsx`

**Intent**: `account.astro` — swap `bg-cosmic`→light background, gradient `<h1>`→solid token. `AccountDangerZone.tsx` — convert the `border-red-500/30 bg-red-900/10` danger card to a token/destructive-tinted `<Card>` (danger variant). `DeleteAccountDialog.tsx` — restyle the `Dialog` surface + drop the Cancel override; its confirm input is already tokenized via `FormField`.

**Contract**: Classes only. Preserve: `<h1>Account`; `Signed in as {email}`; `<h2>Danger zone`; `Button` text `Delete account`; `<DialogTitle>Delete your account?`; the FormField confirm label `` `Type ${email} to confirm` `` (id `confirm-email`, `type="email"`) and placeholder `{email}`; `Button` text `Cancel` / `Delete account` / `Deleting...`.

#### 2. Auth pages + auth form components

**File**: `src/pages/auth/{signin,signup,confirm-email}.astro`, and `src/components/auth/{SignInForm,SignUpForm,ServerError,SubmitButton,PasswordToggle}.tsx` (only where dark classes exist)

**Intent**: Swap each auth page's `bg-cosmic`→light background and gradient headings→solid token; retokenize any card/panel/button dark classes in the auth form components. Inputs already tokenized via `FormField`.

**Contract**: Classes only. Preserve verbatim the `<h1>`/heading text on `auth/signin` = **`Sign in`** (E2E-load-bearing heading + `/auth/signin` route), plus sign-up / confirm-email headings, all `FormField` labels/ids/types, and every submit/link text and `href`.

### Success Criteria:

#### Automated Verification:

- Build passes: `npm run build`
- Lint passes: `npm run lint`
- Typecheck passes: `npm run astro check`
- Unit tests pass: `npm test`
- E2E suite passes fully: `npx playwright test` — `protected-routes-auth.spec` asserts the `Sign in` and `Account` headings + `/auth/signin` redirect; `seed.spec` still green.

#### Manual Verification:

- Account + danger zone + delete-account dialog render in the light system; the danger card still reads as destructive/warning.
- Sign in / sign up / confirm-email pages render fully light and consistent with the rest of the app (no leftover dark shell, no gradient heading).
- Whole-app pass: no page still shows `bg-cosmic`/`bg-white/5`/`bg-purple-600`; the app is coherently in the S-08 light system.

**Implementation Note**: After all verification passes, S-09 is complete. Run `/10x-impl-review` before closing.

---

## Testing Strategy

### Unit Tests:

- Existing Vitest suite (`src/lib/**/*.test.ts`) stays green — **no logic files change** in S-09 (only class/markup-attribute edits). No new unit tests needed; a class-only slice has nothing unit-testable.

### Integration / E2E Tests:

- `e2e/seed.spec.ts` + `e2e/protected-routes-auth.spec.ts` are the per-phase gate — they assert only roles/names/labels/headings/routes/`type`, all preserved. **Prerequisite:** refresh `playwright/.auth/user.json` against a live local Supabase session once before Phase 1 so `seed.spec` passes (the S-08 4/5 was an expired fixture, not a regression).
- No new E2E specs are added — the contract they lock is exactly what S-09 must not break. (New browser tests, if any, belong to `/10x-e2e`, not this visual slice.)

### Manual Testing Steps:

1. Per phase: load the restyled screen(s); confirm the light system (background, cards, buttons, badges) matches the design `ui_kits/app` + `/design-preview`.
2. Spot-check the accessibility tree (browser devtools / axe): headings, labels, roles, aria-labels unchanged vs. the pre-S-09 screen.
3. Exercise interactive flows (add/edit/delete product, log/delete sales entry, generate restocking plan, delete-account dialog) — behavior and loading states unchanged (NFR-001).
4. Final whole-app pass: grep the screens for any residual `bg-cosmic`/`bg-white/5`/`bg-purple`/`from-blue-200` and confirm none remain in-scope.

## Performance Considerations

Class-only changes have no runtime cost. NFR-001 (perceived responsiveness / sub-1-second updates) must not regress: keep every skeleton/loading/`aria-live` element and its visibility timing — only its colors change. NFR-002 (browser support): token utilities and Geist are already shipped by S-08.

## Migration Notes

No data or schema migration. Transient cross-phase state is expected and benign: after Phase 2 tokenizes `FormField`, the auth/account pages show light inputs on still-dark shells until Phase 4 finalizes them. `bg-cosmic` stays defined in `global.css` (still used by out-of-scope `Welcome.astro`/S-10 and `design-preview`).

## References

- Design system (Claude Design project): `a1fc2530-a078-42b2-a0ae-501b94b777a0` — `ui_kits/app`, `components/*`, `guidelines/*`. Access via the `claude_design` MCP (`/design-login`).
- S-08 output (consumed here): `src/styles/global.css` (tokens + `--status-*` + Geist), `src/components/ui/{button,card,input,badge,dialog,checkbox}.tsx`, `src/lib/classification-ui.ts` (`STATE_STYLES`, already tokenized), `/design-preview`.
- S-08 plan/brief: `context/changes/design-system-refresh/plan.md`, `plan-brief.md`.
- E2E contract: `e2e/seed.spec.ts`, `e2e/protected-routes-auth.spec.ts`, `playwright.config.ts`.
- Frontend design guidance: `frontend-design` skill (read before implementing).
- Roadmap slice: `context/foundation/roadmap.md` → S-09 (`screens-restyle`).

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Dashboard + shared app shell

#### Automated

- [x] 1.1 Build passes: `npm run build` — a0d5a81
- [x] 1.2 Lint passes: `npm run lint` — a0d5a81
- [x] 1.3 Typecheck passes: `npm run astro check` — a0d5a81
- [x] 1.4 Unit tests pass: `npm test` — a0d5a81
- [x] 1.5 E2E suite passes fully: `npx playwright test` (refreshed fixture) — a0d5a81

#### Manual

- [x] 1.6 Dashboard renders in the light system, matches design reference — a0d5a81
- [x] 1.7 Product-card status `<Badge>` renders with unchanged state text — a0d5a81
- [x] 1.8 Topbar renders light; `Sign out` posts to `/api/auth/signout` — a0d5a81
- [x] 1.9 No regression in loading/skeleton states (NFR-001) — a0d5a81

### Phase 2: Products list + product form + delete dialogs

#### Automated

- [x] 2.1 Build passes: `npm run build` — 69d67cc
- [x] 2.2 Lint passes: `npm run lint` — 69d67cc
- [x] 2.3 Typecheck passes: `npm run astro check` — 69d67cc
- [x] 2.4 Unit tests pass: `npm test` — 69d67cc
- [x] 2.5 E2E suite passes fully incl. `seed.spec`: `npx playwright test` — 69d67cc

#### Manual

- [x] 2.6 Products list + add/edit/delete/bulk flows render in the light system, no purple buttons — 69d67cc
- [x] 2.7 Add/Edit dialog on S-08 surface; `Name` textbox + `Stock quantity` spinbutton tokenized, labels intact — 69d67cc
- [x] 2.8 Auth/account inputs now tokenized (expected transient state) — 69d67cc

### Phase 3: Product detail + sales entry + classification

#### Automated

- [x] 3.1 Build passes: `npm run build` — 91a764e
- [x] 3.2 Lint passes: `npm run lint` — 91a764e
- [x] 3.3 Typecheck passes: `npm run astro check` — 91a764e
- [x] 3.4 Unit tests pass: `npm test` — 91a764e
- [x] 3.5 E2E suite passes fully: `npx playwright test` — 91a764e

#### Manual

- [x] 3.6 Detail screen (panel, entries, forms, dialogs) renders in the light system, matches design — 91a764e
- [x] 3.7 Classification `<Badge>` muted with unchanged state text; threshold ladder legible — 91a764e
- [x] 3.8 Sales-entry add/delete visual flow works; loading/disabled states visible — 91a764e

### Phase 4: Account + auth pages

#### Automated

- [x] 4.1 Build passes: `npm run build` — c3272f8
- [x] 4.2 Lint passes: `npm run lint` — c3272f8
- [x] 4.3 Typecheck passes: `npm run astro check` — c3272f8
- [x] 4.4 Unit tests pass: `npm test` — c3272f8
- [x] 4.5 E2E suite passes fully: `npx playwright test` — c3272f8

#### Manual

- [x] 4.6 Account + danger zone + delete-account dialog render light; danger card still reads destructive — c3272f8
- [x] 4.7 Sign in / sign up / confirm-email pages render fully light and consistent — c3272f8
- [x] 4.8 Whole-app pass: no residual `bg-cosmic`/`bg-white/5`/`bg-purple-600` in-scope — c3272f8
