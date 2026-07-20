# Landing Page (S-10) — Plan Brief

> Full plan: `context/changes/landing-page/plan.md`

## What & Why

Replace the default `/` route — currently the "10x Astro Starter" boilerplate — with a real, public StockHelper landing page in the S-08 light design system, matching the Claude Design `ui_kits/landing` recipe. It gives logged-out visitors a reason to sign up (hero value prop → how it works → product preview → CTA) instead of dropping them on placeholder marketing copy.

## Starting Point

`index.astro` renders `Welcome.astro` (a dark "cosmic" boilerplate hero + feature cards) with no session logic. S-09 already shipped the light design system app-wide, and `middleware.ts` already populates `Astro.locals.user` on every request while leaving `/` public. So the tokens, the shared `Button`/`Badge`/`Card`, and the session data are all in place — this slice is presentation + one routing decision.

## Desired End State

Anonymous visitors to `/` see a five-section Polish landing (Nav, Hero, 3-step "how it works", a mini-dashboard product preview with all five classification states, Final CTA + footer). Authenticated visitors are redirected to `/dashboard` before any landing renders. `/` stays public; the old boilerplate is deleted; a Playwright spec locks both routing behaviors.

## Key Decisions Made

| Decision           | Choice                                                   | Why (1 sentence)                                                                                                       | Source       |
| ------------------ | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------ |
| Redirect mechanism | Page-level `Astro.redirect` in `index.astro` frontmatter | `/` must stay public (not in `PROTECTED_ROUTES`), so the authed→dashboard redirect can't live in the middleware guard. | Plan (brief) |
| Copy language      | Polish (match the design)                                | Explicitly asked to match the design; roadmap S-11/S-12 already migrate the app to Polish.                             | Plan         |
| Section scope      | Full design — all 5 sections incl. product preview       | Faithful to the design; the mini-dashboard is buildable from the existing `<Badge>`.                                   | Plan         |
| Code structure     | Astro-only, extracted `src/components/landing/*.astro`   | Static content = Astro per CLAUDE.md; zero client JS; thin `index.astro`; each section verifiable.                     | Plan         |
| E2E coverage       | Add a landing + redirect spec                            | Locks the session-conditional redirect — the slice's named routing trap.                                               | Plan         |
| Old boilerplate    | Delete `Welcome.astro` + `Topbar.astro`                  | Both verified dead once `index.astro` stops importing `Welcome`.                                                       | Plan         |

## Scope

**In scope:** rewrite `index.astro` (redirect + landing); Nav / Hero / Steps / Preview / FinalCta section components; optional `lang` prop on `Layout`; delete dead boilerplate; landing E2E spec.

**Out of scope:** any middleware/auth/API/engine/data change; real data in the preview (static mockup); translating the rest of the app; React islands / interactivity; dark theme; mobile layout; removing the `bg-cosmic` utility.

## Architecture / Approach

`index.astro` frontmatter checks `Astro.locals.user` → redirects authed users to `/dashboard`, else composes five `.astro` section components. All "buttons" are `<a>` links styled with `buttonVariants` (→ `/auth/signup`, `/auth/signin`). The design `.jsx` recipe is a spec: its tokens translate to the repo idiom via a documented delta table — the key trap being that the design's `--accent` (indigo action) is the repo's `--primary`, not the repo's muted-gray `--accent`.

## Phases at a Glance

| Phase                        | What it delivers                                                            | Key risk                                                               |
| ---------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 1. Routing + shell + cleanup | `index.astro` redirect + Nav/Hero/FinalCta; `lang` prop; delete boilerplate | The public-vs-redirect contract; `--accent`→`--primary` mistranslation |
| 2. Content sections          | 3-step "how it works" + mini-dashboard preview (5 states)                   | Faithful token translation of the richer sections                      |
| 3. E2E + full verification   | `landing.spec.ts` (anon sees hero / authed → dashboard); full suite green   | Auth `storageState` fixture must be a live session                     |

**Prerequisites:** S-08 (done) and S-09 (already shipped); `claude_design` MCP access; a live `playwright/.auth/user.json` for the authed E2E case.
**Estimated effort:** ~1 session across 3 phases (small, presentation-only).

## Open Risks & Assumptions

- The routing trap: a naive guard that protects `/` would lock anonymous visitors out of the landing; a missing page-level redirect would show logged-in owners the marketing page. The redirect is conditional on session, not route protection.
- EN-app / PL-landing split is an accepted transitional state until S-11 migrates the app to Polish.
- The design's `--accent` must map to the repo's `--primary` (not `--accent`) — the single most likely mistranslation.

## Success Criteria (Summary)

- Anonymous `/` shows the full Polish landing in the light system; authenticated `/` redirects to `/dashboard`.
- `/` stays public; `Welcome.astro`/`Topbar.astro` are gone; no dead imports.
- `npm run build` / `lint` / `astro check` / `test` and the full Playwright suite all pass.
