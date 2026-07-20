# S-08 Design System Refresh — Implementation Plan

## Overview

Adopt the **StockHelper Design System** (a Claude Design project, `a1fc2530-…`) as a **light visual reskin** of the app's shared component foundation. This slice rewrites the token layer, self-hosts the Geist type family, and builds/restyles the shared shadcn base components (button, dialog, checkbox, card, input, status badge) so downstream screens (S-09) can adopt them.

**Hard boundary:** visual layer only. No React island logic, no API changes, and **no screen/page restyling** — screens are S-09. All accessible names, ARIA roles, headings, labels, and routes are preserved so the Playwright E2E suite stays green.

## Current State Analysis

- **Token layer** lives in `src/styles/global.css` (Tailwind 4 CSS-first): a `:root` block of shadcn CSS variables (`--background`, `--foreground`, `--card`, `--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`, …), all currently **zero-chroma grayscale** (stock shadcn neutral), a `.dark` block (also stock gray, effectively unused), and an `@theme inline` map exposing `--color-*` to Tailwind. There is a bespoke `@utility bg-cosmic` (hardcoded near-black gradient) and a `tw-animate-css` import.
- **shadcn config** (`components.json`): `style: new-york`, `cssVariables: true`, `baseColor: neutral`, css entry `src/styles/global.css`, `iconLibrary: lucide`.
- **Existing UI primitives** in `src/components/ui/`: `button.tsx` (cva; variants default/destructive/outline/secondary/ghost/link; sizes default/sm/lg/icon; token-based), `dialog.tsx` (radix; token-based; overlay `bg-black/50`), `checkbox.tsx` (radix; token-based; indigo-ready), and `LibBadge.astro` (**dead code — zero importers**).
- **No `card.tsx`, no `input.tsx`, no status-badge component.** Cards are ~15 duplicated raw `<div>`s (`rounded-2xl border border-white/10 bg-white/5`). Inputs funnel through `src/components/auth/FormField.tsx` (`inputBase` hardcoded).
- **The 5 classification-status colors** live in `src/lib/classification-ui.ts` as `STATE_STYLES: Record<ClassificationState, string>` (hardcoded dark Tailwind classes), consumed by exactly two render sites: `src/components/dashboard/ProductCard.astro:22` and `src/components/sales/ClassificationPanel.tsx:54,93`.
- **The shipped app is dark** ("cosmic" theme). Screens hardcode dark classes (`bg-white/5`, `text-blue-100`, `bg-purple-600`) and frequently override the token-based Button/DialogContent variants with purple/slate. Because screens override the tokens, **changing `:root` is largely invisible on current screens until S-09** removes those overrides.

### Key Discoveries:

- **Design source of truth** is the Claude Design project (read via the `claude_design` MCP): `tokens/{colors,typography,fonts,spacing}.css`, component `.jsx` + `.prompt.md` specs, and `ui_kits/{app,landing}`. The design's own `colors.css` explicitly references `src/lib/classification-ui.ts` as the engine's status→color mapping it mirrors.
- **Token-name collision:** the design uses `--surface / --text / --accent` where **`--accent` = the indigo primary action**; shadcn uses `--card / --foreground / --primary` and treats `--accent` as a _muted hover surface_. Copying design token names verbatim would break every component. → We **map design values onto the shadcn variable contract** (see Critical Implementation Details), leaving component classes untouched.
- **Design component recipes** (`components/core/Button.jsx`, `Badge.jsx`, etc.) use inline styles referencing CSS vars. They are **reference specs, not code to copy** — the implementer translates them into the repo's cva + Tailwind-class + shadcn-token idiom.
- **E2E contract** (2 specs, zero style assertions): preserve the strings `Add product` / `Name` / `Stock quantity`, product rows as `link` role, `Delete <name>` aria-labels, headings `Sign in` / `Dashboard` / `Products` / `Account` as heading elements, `type="number"` on Stock quantity, and the `/auth/signin` route. Colors/spacing/fonts are free to change.
- **Radius already aligns:** design base radius `0.625rem` == existing `--radius`. Design button radius = `--radius-md` (8px), card = `--radius-lg` (10px), dialog = `--radius-xl` (14px).

## Desired End State

`src/styles/global.css` carries the light design palette (mapped onto shadcn names) plus 5 `--status-*` token families and Geist wired as `--font-sans`/`--font-mono`; Geist is self-hosted (no runtime CDN dependency). The shared UI library (`button`, `dialog`, `checkbox`, `card`, `input`, `badge`) renders in the new light system and is provably correct on a dev-only `/design-preview` page. `src/lib/classification-ui.ts` `STATE_STYLES` references the new status tokens; its two existing consumers render the muted status colors with **unchanged text and roles**. The Playwright E2E suite passes unchanged. No screen/page is otherwise restyled.

Verification of the end state: `/design-preview` shows the full palette, type scale, and every component variant in the light system; `npm run build`, `npm run lint`, and typecheck pass; `npx playwright test` passes.

## What We're NOT Doing

- **Not** restyling any screen or page (`dashboard.astro`, `products/**`, `ProductCatalog.tsx`, `ProductDetail.tsx`, `RestockingPlan.tsx`, forms, auth pages) — that is **S-09**.
- **Not** removing the hardcoded `bg-purple-600` / `bg-white/5` / `bg-cosmic` overrides in screen components — S-09.
- **Not** refactoring `src/components/auth/FormField.tsx` onto the new `Input` (would touch the label↔input association E2E relies on) — S-09.
- **Not** creating a `Field` wrapper (the app already has `FormField`).
- **Not** cleaning dead code (`LibBadge.astro`, `Banner.astro`) or building the landing page (S-10).
- **Not** adding a dark theme or theme toggle. `:root` becomes light; the `.dark` block is left in place but inert.
- **Not** changing any component's variant/prop API, element tags, roles, or accessible names.

## Implementation Approach

Three phases, each ending in a visible, independently-verifiable artifact on `/design-preview`. Phase 1 lays the token + font foundation and the preview scaffold; Phase 2 delivers the non-status primitives; Phase 3 delivers the status system and runs the E2E regression gate. The token bridge (design→shadcn) is the load-bearing decision and is fixed in Phase 1; everything downstream consumes it.

## Critical Implementation Details

- **Token bridge (design → shadcn contract).** Set shadcn variables from the design palette rather than renaming anything: `--primary`←`--accent` (indigo-600), `--primary-foreground`←`--accent-fg`, `--background`←design `--background`, `--card`/`--popover`←`--surface`, `--foreground`/`--card-foreground`←`--text`, `--muted`←`--surface-muted`, `--muted-foreground`←`--text-muted`, `--secondary`←`--surface-muted`, `--accent` (shadcn hover surface)←`--surface-sunken`, `--border`←design `--border`, `--input`←`--border-strong`, `--ring`←design `--ring`, `--destructive`←`--red-600`. Keep values in the design's `oklch()`. Preserve the existing variable **names** — components already reference them.
- **Status tokens need `@theme inline` exposure.** Tailwind only generates utilities like `bg-status-under-bg` if a matching `--color-status-under-bg: var(--status-under-bg)` exists in the `@theme inline` block. Add all 20 status color mappings (5 states × bg/border/fg/solid) there, or the `STATE_STYLES` classes won't compile.
- **Button variant keys are a contract.** Existing consumers pass `variant="outline" | "secondary" | "ghost" | "destructive" | "link"` and the default. Do **not** rename keys to the design's `primary/secondary/…`; retune each existing key's class recipe to the token contract (design `primary`→existing default; design `secondary`/outline-on-white→existing `outline`; design `ghost`/`link`/`destructive`→same keys). Renaming keys would visually break every consumer.
- **Design `.jsx` are specs, not code.** They use inline styles + raw CSS vars; translate to the repo's cva/Tailwind/shadcn pattern. Pull exact recipes from the design project during implementation via the `claude_design` MCP (`components/core/Button.jsx`, `Badge.jsx`, `Card.jsx`, `components/forms/Input.jsx`, `components/overlay/Dialog.jsx`).
- **Font package verification.** Self-host Geist via `@fontsource` — verify the exact published package + import path before wiring (candidates: `@fontsource-variable/geist` + `@fontsource-variable/geist-mono`, or the static `@fontsource/geist-sans` / `@fontsource/geist-mono`). The Vercel `geist` npm package is Next-only — do not use it here. Replace the design's Google-Fonts `@import` with the local import so there is no CDN dependency on Cloudflare Workers.
- **E2E requires manual server + auth session.** `playwright.config.ts` has **no `webServer`** block and expects `playwright/.auth/user.json`. Running the suite (Phase 3 gate) means: start `npm run dev` (port 4321), ensure the auth session exists, then `npx playwright test`.

---

## Phase 1: Tokens, fonts & preview scaffold

### Overview

Rewrite the token layer to the light design palette (shadcn-mapped), add the 5 status token families, self-host Geist, and stand up the `/design-preview` page with color/type/spacing swatches.

### Changes Required:

#### 1. Token layer

**File**: `src/styles/global.css`

**Intent**: Replace the grayscale `:root` values with the design's light palette using the token bridge; add the neutral slate ramp, indigo accent, 5 status families, and radius/shadow/motion tokens the components consume. Wire `--font-sans`/`--font-mono` to Geist. Leave the `.dark` block and `@custom-variant dark` in place but do not update them (inert). Keep `bg-cosmic` for now (removed in S-09).

**Contract**: `:root` variables keep their existing shadcn **names**; only values change (per the token-bridge mapping in Critical Implementation Details). Add new `--status-{under,watch,ok,slow,insuff}-{bg,border,fg,solid}` variables (copy oklch values from the design `tokens/colors.css`). Extend `@theme inline` with `--color-status-*` for all 20 status entries so Tailwind emits `bg-/text-/border-status-*` utilities. Example of the status exposure that must exist:

```css
@theme inline {
  /* …existing --color-* … */
  --color-status-under-bg: var(--status-under-bg);
  --color-status-under-fg: var(--status-under-fg);
  --color-status-under-border: var(--status-under-border);
  --color-status-under-solid: var(--status-under-solid);
  /* …repeat for watch / ok / slow / insuff … */
}
```

#### 2. Self-hosted Geist

**File**: `package.json`, `src/styles/global.css` (and `astro.config.mjs` only if a font integration is used)

**Intent**: Add the `@fontsource` Geist + Geist Mono packages and import them so `--font-sans`/`--font-mono` resolve locally, with no Google-Fonts `@import`.

**Contract**: New dev/runtime dependency on the verified `@fontsource` Geist packages; a font `@import`/side-effect import in `global.css` (or the app entry) ahead of the token blocks; `--font-sans`/`--font-mono` reference `"Geist"` / `"Geist Mono"` with the design's fallback stacks.

#### 3. Design preview scaffold

**File**: `src/pages/design-preview.astro` (new)

**Intent**: A dev-only page rendering the palette (neutrals, accent, 5 status families), the type scale (Geist + Geist Mono), and spacing/radius swatches — the in-repo equivalent of the design's `guidelines/*` specimens — so the token layer is visually verifiable now and reused as the S-09 reference.

**Contract**: New route `/design-preview`. `export const prerender = false` if it renders under SSR defaults. No auth requirement; must not be added to `PROTECTED_ROUTES`. Contains only static markup + token classes (no domain data, no islands).

### Success Criteria:

#### Automated Verification:

- Build passes: `npm run build`
- Lint passes: `npm run lint`
- Typecheck passes: `npm run astro check` (or the repo's typecheck script)
- Geist packages resolve (install succeeds; no unresolved font import)

#### Manual Verification:

- `/design-preview` renders the full light palette, the 5 status families, and the Geist/Geist Mono type scale
- Text renders in Geist (not the system stack) with no flash of a CDN fetch (fonts served locally)
- No visible regression on existing screens attributable to the token change (screens still render via their hardcoded overrides)

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 2.

---

## Phase 2: Base components (button, dialog, checkbox, card, input)

### Overview

Restyle the existing token-based primitives and create the two missing ones, all consuming the new token contract. Extend `/design-preview` with every variant.

### Changes Required:

#### 1. Button restyle

**File**: `src/components/ui/button.tsx`

**Intent**: Retune the cva variant/size recipes to the design (medium weight, `tracking-snug`, `--radius-md`, `--shadow-xs`, hover darkens fill / tints surface, active nudges 0.5px). Keep all existing variant **keys** and the component API.

**Contract**: `buttonVariants` keys unchanged (`default`, `destructive`, `outline`, `secondary`, `ghost`, `link`; sizes `default/sm/lg/icon`); class recipes updated to token utilities. Size `lg` height aligns to the design (44px) if adjusted. No prop/signature change.

#### 2. Dialog restyle

**File**: `src/components/ui/dialog.tsx`

**Intent**: Apply the design's dialog surface — `--radius-xl` corners, `--shadow-lg`, and a softer scrim — while keeping the radix structure, `data-slot`s, and the `DialogTitle` that supplies the dialog's accessible name.

**Contract**: `DialogContent` container classes updated (radius/shadow); overlay scrim restyled (from `bg-black/50` to the design's translucent scrim). `DialogTitle`/`DialogDescription` roles and text untouched. No API change.

#### 3. Checkbox confirm

**File**: `src/components/ui/checkbox.tsx`

**Intent**: Verify the checked/indeterminate states now read as indigo via `--primary`; adjust radius/border only if needed.

**Contract**: Token-based classes retained; no API change.

#### 4. Card component (new)

**File**: `src/components/ui/card.tsx` (new)

**Intent**: Create the base white surface with optional title/description/action header, plus `muted` (sunken, no shadow) and `padding={false}` variants, per `components/core/Card.prompt.md`.

**Contract**: shadcn-style composable exports (e.g. `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardAction`, `CardContent`) or a single prop-driven `Card` matching the design API; token classes `bg-card text-card-foreground border --shadow-sm`, `rounded-lg`. `data-slot` attributes per shadcn convention.

#### 5. Input component (new)

**File**: `src/components/ui/input.tsx` (new)

**Intent**: Create the text/numeric input primitive — `variant="numeric"` uses the mono/tabular face, optional unit `suffix`, and an `invalid` error border — per `components/forms/Input.prompt.md`. Does **not** touch `FormField`.

**Contract**: `Input` accepting native input props + `variant?: "text" | "numeric"`, `suffix?`, `invalid?`; token classes `border-input bg-transparent ring-ring` + `--radius-sm`; numeric variant applies `--font-mono` + tabular figures. `type` is caller-controlled (so `type="number"` → `spinbutton` role is preserved by consumers).

#### 6. Extend preview

**File**: `src/pages/design-preview.astro`

**Intent**: Add every button variant/size, dialog, checkbox states, card variants, and input variants to the preview.

**Contract**: Static usage examples of each component/variant.

### Success Criteria:

#### Automated Verification:

- Build passes: `npm run build`
- Lint passes: `npm run lint`
- Typecheck passes: `npm run astro check`
- Unit tests pass: `npm test` (no regressions)

#### Manual Verification:

- Every button variant/size, dialog, checkbox state, card variant, and input variant renders correctly in the light system on `/design-preview`
- Hover/press/focus states match the design (fill darkens, 3px indigo focus ring)
- No component API/role changed (spot-check button roles, dialog title as accessible name)

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 3.

---

## Phase 3: Status system + regression gate

### Overview

Tokenize the status color map, build the status Badge on top of it, extend the preview, then run the E2E regression gate.

### Changes Required:

#### 1. Tokenize status map

**File**: `src/lib/classification-ui.ts`

**Intent**: Replace the hardcoded dark Tailwind classes in `STATE_STYLES` with the new muted status-token utilities, keeping the map as the single source of truth for state→color. This visually updates the two existing consumers (dashboard `ProductCard.astro`, `ClassificationPanel.tsx`) — **text and roles unchanged**, colors only.

**Contract**: `STATE_STYLES` keys unchanged (the 5 `ClassificationState` values); each value becomes token classes, e.g.:

```ts
Understocked: "bg-status-under-bg text-status-under-fg border-status-under-border",
// Watch → -watch-, OK → -ok-, "Slow-mover" → -slow-, "Insufficient data" → -insuff-
```

The `-solid` dot color is exposed for the Badge (Change 2). No change to `classification.ts` (engine/thresholds/order).

#### 2. Badge component (new)

**File**: `src/components/ui/badge.tsx` (new)

**Intent**: Create the status pill — `state` drives the five-state look (muted hue + solid dot); `tone="neutral"|"accent"` + children for generic tags — per `components/core/Badge.prompt.md` / `Badge.jsx`. Consume the status tokens (reuse `STATE_STYLES` where practical so the mapping stays single-sourced).

**Contract**: `Badge({ state?: ClassificationState, tone?: "neutral"|"accent", dot?: boolean, children? })`; token classes for bg/fg/border + a `--radius-full` pill + optional dot colored by `-solid`. The five `state` values map 1:1 to the engine. Not yet wired into screens (S-09 swaps the two raw spans for `<Badge>`).

#### 3. Extend preview

**File**: `src/pages/design-preview.astro`

**Intent**: Add all five status badges + neutral/accent tone badges.

**Contract**: Static examples of each state + tone.

### Success Criteria:

#### Automated Verification:

- Build passes: `npm run build`
- Lint passes: `npm run lint`
- Typecheck passes: `npm run astro check`
- Unit tests pass: `npm test`
- **E2E suite passes: `npx playwright test`** (dev server on :4321 + `playwright/.auth/user.json` present)

#### Manual Verification:

- All 5 status badges + neutral/accent tones render muted and legible side-by-side on `/design-preview`
- The two existing status render sites (dashboard product card, classification panel) show the new muted colors with **identical text and structure**
- E2E green confirms no accessible-name/role/label/route regression
- Full visual sign-off of `/design-preview` against the design system

**Implementation Note**: After all verification passes, S-08 is complete. `/design-preview` remains as the S-09 reference (gate or remove before shipping to production, per team preference).

---

## Testing Strategy

### Unit Tests:

- Existing Vitest suite (`src/lib/**/*.test.ts`) must stay green — no engine/logic files change except `classification-ui.ts` (color strings only; add/adjust a test only if one asserts on `STATE_STYLES` values).

### Integration / E2E Tests:

- `e2e/seed.spec.ts` and `e2e/protected-routes-auth.spec.ts` must pass unchanged. They assert only roles/names/labels/headings/routes — all preserved. This is the Phase 3 gate.

### Manual Testing Steps:

1. Load `/design-preview`; verify palette, type (Geist), spacing, and every component variant in the light system.
2. Exercise hover/press/focus on buttons; confirm indigo focus ring and fill-darken hover.
3. Open a dialog on `/design-preview`; confirm radius/shadow/scrim.
4. Confirm the 5 status badges are muted and mutually legible.
5. Spot-check an existing screen (dashboard) — status badges show new muted colors; text unchanged.

## Performance Considerations

Self-hosting Geist removes a render-time dependency on `fonts.googleapis.com` (better and more deterministic on Cloudflare Workers). Watch bundle weight: prefer the variable Geist packages and only the weights the design uses (400/500/600/700 sans; 400/500/600 mono). Token/CSS changes have no runtime cost.

## Migration Notes

No data or schema migration. The token change is backward-compatible because screens currently override tokens with hardcoded classes; the visible cutover happens in S-09. `.dark` is retained (inert) so a future dark theme can be authored without re-scaffolding.

## References

- Design system (Claude Design project): `a1fc2530-a078-42b2-a0ae-501b94b777a0` — `tokens/*`, `components/core/{Button,Card,Badge}.{jsx,prompt.md}`, `components/forms/Input.prompt.md`, `components/overlay/Dialog.prompt.md`, `readme.md`. Access via the `claude_design` MCP.
- Status color source: `src/lib/classification-ui.ts:8-14` (`STATE_STYLES`), consumers `src/components/dashboard/ProductCard.astro:22`, `src/components/sales/ClassificationPanel.tsx:54,93`.
- Token layer: `src/styles/global.css`; shadcn config `components.json`.
- E2E contract: `e2e/seed.spec.ts`, `e2e/protected-routes-auth.spec.ts`, `playwright.config.ts`.
- Roadmap slice: `context/foundation/roadmap.md` → S-08 (`design-system-refresh`).

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Tokens, fonts & preview scaffold

#### Automated

- [x] 1.1 Build passes: `npm run build`
- [x] 1.2 Lint passes: `npm run lint`
- [x] 1.3 Typecheck passes: `npm run astro check`
- [x] 1.4 Geist packages resolve (install + font import)

#### Manual

- [x] 1.5 `/design-preview` renders palette, 5 status families, Geist type scale
- [x] 1.6 Text renders in Geist locally (no CDN fetch)
- [x] 1.7 No token-change regression on existing screens

### Phase 2: Base components (button, dialog, checkbox, card, input)

#### Automated

- [ ] 2.1 Build passes: `npm run build`
- [ ] 2.2 Lint passes: `npm run lint`
- [ ] 2.3 Typecheck passes: `npm run astro check`
- [ ] 2.4 Unit tests pass: `npm test`

#### Manual

- [ ] 2.5 All button/dialog/checkbox/card/input variants render on `/design-preview`
- [ ] 2.6 Hover/press/focus states match the design (indigo focus ring)
- [ ] 2.7 No component API/role changed

### Phase 3: Status system + regression gate

#### Automated

- [ ] 3.1 Build passes: `npm run build`
- [ ] 3.2 Lint passes: `npm run lint`
- [ ] 3.3 Typecheck passes: `npm run astro check`
- [ ] 3.4 Unit tests pass: `npm test`
- [ ] 3.5 E2E suite passes: `npx playwright test`

#### Manual

- [ ] 3.6 5 status badges + tones render muted/legible on `/design-preview`
- [ ] 3.7 Existing status render sites show new muted colors, text unchanged
- [ ] 3.8 Full visual sign-off of `/design-preview` against the design system
