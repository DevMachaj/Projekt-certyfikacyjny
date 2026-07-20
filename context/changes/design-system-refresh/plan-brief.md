# S-08 Design System Refresh — Plan Brief

> Full plan: `context/changes/design-system-refresh/plan.md`

## What & Why

Adopt the **StockHelper Design System** (a Claude Design project) as a **light visual reskin** of the app's shared component foundation — new color/typography/spacing tokens applied to the base shadcn/ui components. This is S-08: it builds the token + component layer so downstream screens (S-09) can consume it. Visual layer only — no logic, no API, no screen restyling.

## Starting Point

The token layer (`src/styles/global.css`) is stock shadcn **grayscale**; the shipped app is a dark "cosmic" theme that mostly **hardcodes** its colors (`bg-white/5`, `bg-purple-600`) and overrides the token-based primitives. `src/components/ui/` has only `button`, `dialog`, `checkbox`, and a dead `LibBadge.astro` — **no card, input, or status badge**. The 5 classification-status colors live in one map: `src/lib/classification-ui.ts` (`STATE_STYLES`), used by 2 files.

## Desired End State

`global.css` carries the light design palette (mapped onto shadcn variable names) + 5 `--status-*` families; Geist is self-hosted; the shared library (button, dialog, checkbox, **card**, **input**, **badge**) renders in the new light system and is provably correct on a dev-only `/design-preview` page. The Playwright E2E suite passes unchanged. Screens are untouched.

## Key Decisions Made

| Decision        | Choice                                | Why                                                                                                            | Source |
| --------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------ |
| Theme direction | **Flip to light**                     | The design is an explicit light reskin of the dark app; adopt as-is                                            | Plan   |
| Token naming    | **Map design → shadcn contract**      | `--accent`(design)=primary collides with shadcn `--accent`=hover; mapping keeps component classes & E2E stable | Plan   |
| Font delivery   | **Self-host Geist via `@fontsource`** | No CDN dependency / FOUT / privacy issue on Cloudflare Workers                                                 | Plan   |
| Component scope | **Full base set + status tokens**     | Restyle button/dialog/checkbox, create card/input/badge, tokenize `STATE_STYLES`                               | Plan   |
| Verification    | **Dev-only `/design-preview` page**   | Real visual proof of the isolated library; doubles as S-09 reference                                           | Plan   |
| `.dark` block   | **Leave inert**                       | Nothing toggles it today; minimal churn, revisit later                                                         | Plan   |
| Forms depth     | **Create `ui/input.tsx` only**        | Leaving `FormField` preserves the label↔input names E2E asserts; S-09 rewires it                               | Plan   |

## Scope

**In scope:** token rewrite (`global.css`) + 5 status families; self-hosted Geist; restyle `button`/`dialog`/`checkbox`; create `card`/`input`/`badge`; tokenize `classification-ui.ts` `STATE_STYLES`; `/design-preview` page.

**Out of scope:** any screen/page restyle; removing `bg-purple-*`/`bg-cosmic` overrides; refactoring `FormField`; a `Field` component; dead-code cleanup (`LibBadge`, `Banner`); landing page (S-10); dark theme / toggle.

## Architecture / Approach

Bridge the design's semantic tokens onto the **existing shadcn CSS variables** so components keep their current class names (lowest churn, E2E-safe). New `--status-*` variables are exposed through `@theme inline` so Tailwind emits `bg-/text-/border-status-*` utilities. Design component `.jsx` files are **reference specs** — translated into the repo's cva/Tailwind idiom, not copied. Each phase ends visible on `/design-preview`.

## Phases at a Glance

| Phase                      | What it delivers                                                                     | Key risk                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| 1. Tokens, fonts & preview | Light token layer + status families + self-hosted Geist + `/design-preview` swatches | `@theme inline` must expose `--color-status-*` or status utilities won't compile |
| 2. Base components         | Restyled button/dialog/checkbox + new card/input                                     | Renaming button variant keys would break every consumer — keys must stay         |
| 3. Status system + gate    | Tokenized `STATE_STYLES` + new Badge; E2E regression gate                            | E2E needs manual dev server (:4321) + `playwright/.auth/user.json`               |

**Prerequisites:** `claude_design` MCP access to project `a1fc2530-…` (for exact recipes); verified `@fontsource` Geist package.
**Estimated effort:** ~3 sessions, one per phase.

## Open Risks & Assumptions

- Flipping `:root` is largely **invisible on current screens** until S-09 (they override tokens) — expected, not a bug. The visible cutover is S-09's.
- Tokenizing `STATE_STYLES` is the one place S-08 visibly touches screens (2 badge spans) — colors only, text/roles unchanged.
- Geist `@fontsource` package name/import path must be verified before wiring (Vercel's `geist` package is Next-only — not usable here).

## Success Criteria (Summary)

- `/design-preview` shows the full light palette, Geist type scale, and every component variant.
- `npm run build` / `lint` / typecheck green; `npx playwright test` green (no accessible-name/role/route regression).
- The 5 status badges render muted and mutually legible; existing badge sites show new colors with unchanged text.
