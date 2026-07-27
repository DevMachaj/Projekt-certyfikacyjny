# StockHelper

**Velocity-based restocking assistant for solo e-commerce store operators.**

Shop platforms (Shopify, WooCommerce, Etsy, …) show _what_ sold but never
interpret it — the owner still has to derive every reorder decision from raw
totals, memory, and gut feeling. StockHelper adds the missing step: it classifies
each product by its sales **velocity** relative to its own history and current
stock, then turns that into a concrete action — _"Order X units"_ or
_"Consider promotion."_ That decision is the product.

The cost of getting it wrong is binary: **dead stock** (cash locked into
slow-movers) or **stockouts** (revenue lost on top-sellers that ran out before
the next delivery). StockHelper exists to prevent both.

> Full product shaping lives in [`context/foundation/`](./context/foundation/) —
> see [`prd.md`](./context/foundation/prd.md) (problem, personas, user stories,
> requirements, business-logic formulas), [`roadmap.md`](./context/foundation/roadmap.md),
> and [`test-plan.md`](./context/foundation/test-plan.md) (risk map).

## What it does

- **Product catalog (CRUD)** — add, view, edit, and delete products (name, current
  stock, supplier lead time, buffer days). Deleting a product removes its sales
  entries too.
- **Sales entries** — log units sold over a date range; overlapping ranges are
  rejected so they can't silently corrupt the velocity denominator.
- **Velocity classification** — every product is classified as **Understocked /
  Watch / OK / Slow-mover**, or **Insufficient data** when there are fewer than
  7 days of non-overlapping history (honest uncertainty instead of a misleading
  label).
- **Reorder recommendation** — for Understocked items, a specific quantity
  `velocity × (lead_time + buffer_days)`; for Slow-movers, a promotion nudge.
- **Dashboard** — the whole catalog grouped by state (Understocked → Watch → OK →
  Slow-mover → Insufficient data) for at-a-glance health.
- **Weekly restocking plan** — a prioritized plan with an AI-written summary that
  falls back to a deterministic summary when the LLM is unavailable.
- **Per-owner isolation** — each owner's products, sales, and recommendations are
  strictly scoped to their account, enforced at the database level with RLS.

### Core business logic

```
velocity (units/day) = total units sold ÷ total calendar days across all non-overlapping entries
days_of_stock        = current_stock ÷ velocity
reorder_quantity     = velocity × (lead_time_days + buffer_days)
```

The classification/recommendation engine lives in
[`src/lib/classification.ts`](./src/lib/classification.ts) (`classify`,
`velocityOf`, `totalHistoryDays`) and
[`src/lib/restocking.ts`](./src/lib/restocking.ts) (weekly-plan selection); the
AI summary with deterministic fallback is in
[`src/lib/services/restocking-summary.ts`](./src/lib/services/restocking-summary.ts).

## Tech Stack

- [Astro](https://astro.build/) v6 — server-first framework (`output: "server"`, full SSR)
- [React](https://react.dev/) v19 — interactive islands
- [TypeScript](https://www.typescriptlang.org/) v5 — type-safe end to end
- [Tailwind CSS](https://tailwindcss.com/) v4 + [shadcn/ui](https://ui.shadcn.com/) — UI
- [Supabase](https://supabase.com/) — auth + Postgres (with Row-Level Security)
- [Cloudflare Workers](https://workers.cloudflare.com/) — edge deployment runtime
- [Vitest](https://vitest.dev/) + [Playwright](https://playwright.dev/) — unit & E2E tests

## Prerequisites

- Node.js v22.14.0 (as specified in `.nvmrc`)
- npm (comes with Node.js)
- [Docker](https://www.docker.com/) (for the local Supabase stack)

## Getting Started

1. Install dependencies:

```bash
npm install
```

2. Set up Supabase and configure environment variables — see [Supabase Configuration](#supabase-configuration) below.

3. Create a `.dev.vars` file for local Cloudflare dev secrets:

```bash
cp .env.example .dev.vars
```

4. Run the development server:

```bash
npm run dev
```

## Available Scripts

- `npm run dev` — start development server (Cloudflare workerd runtime)
- `npm run build` — build for production
- `npm run preview` — preview production build
- `npm run typecheck` — `astro sync && astro check` (also runs as a pre-commit gate)
- `npm run lint` / `npm run lint:fix` — ESLint with type-checked rules
- `npm run format` — Prettier
- `npm test` — run the Vitest unit suite (`npm run test:watch` for watch mode)

E2E tests run with `npx playwright test` (see [Testing](#testing)).

## Project Structure

```md
.
├── src/
│ ├── layouts/ # Astro layouts
│ ├── pages/ # Astro pages
│ │ └── api/ # API endpoints (products, sales-entries, restocking-plan, auth, account)
│ ├── components/ # UI components (Astro & React islands)
│ ├── lib/ # Business logic — classification, restocking, dashboard, validation
│ │ └── services/ # Extracted services (AI restocking summary)
│ └── middleware.ts # Auth route guard (PROTECTED_ROUTES)
├── supabase/migrations/ # Postgres schema + RLS policies
├── e2e/ # Playwright E2E tests
├── context/foundation/ # Product foundation: PRD, roadmap, tech-stack, test-plan
├── public/ # Public assets
└── wrangler.jsonc # Cloudflare Workers config
```

## Supabase Configuration

This project uses [Supabase](https://supabase.com/) for authentication **and** the
Postgres database. Environment variables are declared via Astro's `astro:env`
schema and treated as **server-only secrets** — they are never exposed to the client.

### First-time setup (local, no cloud project needed)

Requires [Docker](https://www.docker.com/) and ~7 GB RAM.

1. Create your `.env` file:

```bash
cp .env.example .env
```

2. Start the local stack (downloads Docker images on first run). This also applies
   every migration in `supabase/migrations/`, creating the `products` and
   `sales_entries` tables with their RLS policies:

```bash
npx supabase start
```

3. Copy the credentials printed by the CLI into your `.env` and `.dev.vars`:

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_KEY=<anon key from CLI output>
```

4. To stop the stack when done:

```bash
npx supabase stop
```

The local Studio UI is available at `http://localhost:54323`.

> If you pull new migrations later, apply them with `npx supabase db reset`
> (local) or `npx supabase db push` (remote).

### Using a cloud Supabase project instead

If you prefer a hosted Supabase project, add these variables to your `.env` and
`.dev.vars` files, then push the schema with `npx supabase db push`:

| Variable       | Description                                                |
| -------------- | ---------------------------------------------------------- |
| `SUPABASE_URL` | Project URL from Supabase dashboard → Settings → API       |
| `SUPABASE_KEY` | `anon` public key from Supabase dashboard → Settings → API |

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_KEY=<anon-key>
```

### Email confirmation in local development

By default Supabase requires email confirmation before a user can sign in. To skip
this during local development:

1. Open the Supabase dashboard for your project
2. Go to **Authentication → Email → Confirm email**
3. Toggle it **off**

Users can then sign in immediately after sign-up without clicking a confirmation link.

### Routes

| Route                 | Description                                         |
| --------------------- | --------------------------------------------------- |
| `/auth/signin`        | Email/password sign-in form                         |
| `/auth/signup`        | Email/password sign-up form                         |
| `/auth/confirm-email` | Post-signup "check your inbox" page                 |
| `/dashboard`          | Catalog grouped by classification state (protected) |
| `/products`           | Product catalog CRUD + sales entries (protected)    |
| `/account`            | Account management (protected)                      |

Route protection is handled in `src/middleware.ts`: unauthenticated requests to
any path in `PROTECTED_ROUTES` are redirected to `/auth/signin`. Per-owner data
isolation is additionally enforced by Row-Level Security policies in
`supabase/migrations/` (`auth.uid() = user_id` on every operation).

## Testing

- **Unit tests (Vitest)** — the velocity/classification engine and restocking
  logic: `src/lib/*.test.ts` and `src/lib/services/*.test.ts`. Run with `npm test`.
- **E2E tests (Playwright)** — browser-level, risk-driven flows in `e2e/`. Run with
  `npx playwright test`. First-time setup: `npx playwright install chromium`.
  Auth is reused from `playwright/.auth/user.json` (a signed-in storage state).

Tests are tied to the risk map in
[`context/foundation/test-plan.md`](./context/foundation/test-plan.md) — e.g.
`classification.test.ts` covers the velocity-engine edge cases (Risk R2) and
`e2e/protected-routes-auth.spec.ts` covers unauthenticated access to protected
routes (Risk R4).

## Deployment

This project deploys to [Cloudflare Workers](https://workers.cloudflare.com/).

1. Build the project:

```bash
npm run build
```

2. Deploy with Wrangler:

```bash
npx wrangler deploy
```

Set `SUPABASE_URL` and `SUPABASE_KEY` as secrets in your Cloudflare dashboard or
via `npx wrangler secret put`. Remember to push database migrations
(`npx supabase db push`) to the target Supabase project before deploying.

## CI

GitHub Actions runs typecheck + depcruise + lint + test + build on every push
and PR to `main`. Configure `SUPABASE_URL` and `SUPABASE_KEY` as repository
secrets in GitHub for the build step.

## License

MIT
