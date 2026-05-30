---
project: StockHelper
researched_at: 2026-05-30T00:00:00Z
recommended_platform: Cloudflare Workers
runner_up: Railway
context_type: mvp
tech_stack:
  language: TypeScript / JavaScript
  framework: Astro 6 + React 19
  runtime: Cloudflare Workers (workerd / V8 isolate)
  database: Supabase (external, PostgreSQL)
  adapter: "@astrojs/cloudflare v13+"
---

## Recommendation

**Deploy on Cloudflare Workers.**

The project is already fully configured for Cloudflare Workers — `@astrojs/cloudflare` v13 is installed, `wrangler.jsonc` exists, and `npm run dev` runs against the real workerd runtime. Zero migration cost is the decisive factor on a 3-week solo timeline: every alternative requires swapping the Astro adapter, rebuilding env-var wiring, and relearning a new deployment CLI. Cloudflare's free tier (100k requests/day) covers all realistic MVP traffic with no credit card required, the `wrangler` CLI handles the full operational loop unattended, and Cloudflare's MCP catalog (the largest of any evaluated candidate) is directly usable from Claude Code without extra setup. The primary risk — Supabase connection exhaustion under load — is mitigated by Cloudflare Hyperdrive (GA) before the app sees meaningful traffic.

**Important correction from previous research**: `@astrojs/cloudflare` v13 dropped Cloudflare Pages support entirely. The deployment target is Cloudflare **Workers** only. The correct deploy command is `wrangler deploy`, not `wrangler pages deploy`. Any CI/CD docs or tutorials referencing Pages are wrong for this stack version.

## Platform Comparison

| Platform               | CLI-first | Managed/Serverless | Agent-readable docs | Stable deploy API | MCP / Integration | Total                                         |
| ---------------------- | --------- | ------------------ | ------------------- | ----------------- | ----------------- | --------------------------------------------- |
| **Cloudflare Workers** | Pass      | Pass               | Pass                | Pass              | Pass              | **5 / 5**                                     |
| Railway                | Partial   | Pass               | Pass                | Pass              | Pass              | **4.5 / 5**                                   |
| Fly.io                 | Pass      | Pass               | Partial             | Pass              | Partial           | **4 / 5**                                     |
| Render                 | Partial   | Pass               | Pass                | Partial           | Pass              | **4 / 5**                                     |
| Vercel                 | —         | —                  | —                   | —                 | —                 | **DROPPED** (serverless-only, Q1 hard filter) |
| Netlify                | —         | —                  | —                   | —                 | —                 | **DROPPED** (serverless-only, Q1 hard filter) |

**Scoring notes:**

- **CLI-first**: Cloudflare `wrangler` covers deploy, rollback, log tail, secrets, and version management fully. Fly.io `flyctl` is equally comprehensive. Railway lacks a `railway rollback` CLI command (dashboard only) — Partial. Render has no CLI rollback (API/dashboard only) — Partial.
- **Managed/Serverless**: All four remaining platforms abstract away OS, networking, and hardware. All Pass.
- **Agent-readable docs**: Cloudflare publishes `llms.txt` per product (GA) and every docs page is fetchable as markdown. Railway publishes `llms.txt` and AI-optimized endpoints (GA). Render publishes `llms.txt` + `llms-full.txt` (GA). Fly.io has no `llms.txt` — Partial.
- **Stable deploy API**: `wrangler deploy` and `fly deploy` are deterministic one-shot operations with versioned rollback. `railway up` is deterministic. Render's MCP cannot trigger deploys — Partial.
- **MCP / Integration**: Cloudflare's MCP catalog is the largest and most mature (2,500+ API endpoints, Workers Bindings, Observability, AI Gateway — GA). Railway's official MCP at `mcp.railway.com` is GA. Render's MCP at `mcp.render.com` is GA but cannot trigger deploys. Fly.io's `fly mcp server` is **[experimental]** — Partial.

**Soft weights applied:**

- **DX priority (Q2)**: Cloudflare wins decisively — zero migration cost, already wired. Railway is a strong second: good DX, $5/month, MCP GA, but requires adapter swap.
- **Single region (Q4)**: No edge-native bonus applied. All platforms are equivalent for single-region MVP.
- **Co-location preferred (Q5)**: Supabase is already the auth/DB layer. None of the four platforms eliminate this dependency. Cloudflare's native services (D1, KV, R2) are complements, not replacements. Weight is neutral across all candidates.

### Shortlisted Platforms

#### 1. Cloudflare Workers (Recommended)

Already the configured deployment target. `@astrojs/cloudflare` v13 is installed, `wrangler.jsonc` is configured, and the workerd dev server mirrors production exactly via the Cloudflare Vite plugin. First deploy is one command: `npx wrangler deploy`. Free tier (100k req/day, ~3M/month headroom) covers all MVP traffic. The MCP catalog is the best of any evaluated platform: official servers for Workers, observability, docs, and AI Gateway — all GA. Supabase integrates natively, with Hyperdrive (GA) available for connection pooling when needed.

#### 2. Railway

Native persistent Node.js process with no execution-time ceiling and native WebSocket support. Official MCP server GA at `mcp.railway.com`, integrates directly with Claude Code (`claude mcp add railway-mcp-server -- npx -y @railway/mcp-server`). $5/month Hobby plan base. Main friction: requires swapping `@astrojs/cloudflare` → `@astrojs/node` in standalone mode, binding to `HOST=0.0.0.0`, and re-wiring env vars. Estimated 1–2 hours of migration before first deploy.

#### 3. Fly.io

Strongest raw WebSocket and persistent-process support — runs traditional microVMs, not isolates. `flyctl` is mature and comprehensive. No free tier (pay-as-you-go since Oct 2024; ~$5–15/month for this traffic level). MCP is experimental. No `llms.txt`. Also requires adapter swap. Recommended only if future architecture needs long-running background workers that Cloudflare's Scheduled Workers cannot satisfy.

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. **Supabase connection pool exhaustion**: Each Worker isolate opens a new DB connection. Supabase's free tier caps at 60 connections. A traffic surge spawns many isolates simultaneously and exhausts the pool, producing connection-limit errors that appear as random timeouts. Cloudflare Hyperdrive (GA) is the fix, but it requires explicit setup — a `wrangler.jsonc` binding change plus Supabase client refactor — not included in the starter.

2. **Adapter v13 ecosystem fragility**: `@astrojs/cloudflare` v13 broke several popular Astro integrations (astro-icon, Satori-based OG image generators, CommonJS libraries). Libraries that work in Node.js may fail silently in workerd. The ecosystem is still catching up — check compatibility before adding any new npm dependency.

3. **CPU time limit is an invisible ceiling**: Workers enforce a 10 ms CPU-time limit (free) / 30 ms (paid) per invocation, counting only active JS execution — not I/O await time. CPU-bound SSR operations can hit this limit and return a generic 1101 error with no useful log message.

4. **No native PR preview deployments**: Cloudflare Workers doesn't auto-create preview URLs per PR. This must be wired manually via GitHub Actions deploying to a named Worker environment. Setup not included in the starter — a significant DX gap vs. what Astro developers expect from JAMstack-adjacent tooling.

5. **`astro:env/server` dual-config requirement**: Secrets must be declared in both `wrangler.jsonc` (as `[vars]` or bindings) and `astro.config.mjs` (env schema). Local dev uses `.dev.vars`, not `.env`. Diverges from every other platform's env convention and is a common source of "works locally, breaks in production" bugs.

### Pre-Mortem — How This Could Fail

The team ships the MVP on Cloudflare Workers in week one. Everything is smooth — 30-second deploys, `wrangler tail` for real-time logs, the free tier covers all traffic. In week six, they reach for a charting library that uses a Canvas polyfill internally. It fails silently in workerd — no error in logs, just a blank component — and they spend two days diagnosing a native-binary dependency that doesn't exist in the V8 isolate runtime.

Meanwhile, the Supabase free tier's 60-connection limit starts appearing intermittently as beta-tester traffic triggers multiple Worker isolates simultaneously. The errors look like random timeouts, not connection-limit violations. After two hours of query debugging, they discover the real cause. Adding Hyperdrive requires a new binding, a `wrangler.jsonc` change, and a Supabase client refactor — a two-hour detour.

Later, a stakeholder asks for a nightly stock-alert email. Workers Scheduled Triggers can run cron jobs but have a 15-minute wall-clock limit and no event-driven queue model. The architecture requires Cloudflare Queues + a second Worker — a step up in complexity the solo developer wasn't planning for at MVP scope.

Each failure is solvable in isolation; together they erode the "zero configuration" promise that made Cloudflare attractive at the start.

### Unknown Unknowns

- **`wrangler.jsonc` ≠ `wrangler.toml`**: The v13 adapter generates `wrangler.jsonc`. Most Stack Overflow answers and tutorials reference `wrangler.toml`. The two formats are not interchangeable for all keys. Copy-pasting toml config into jsonc silently breaks things.
- **Cloudflare Pages is gone from this adapter**: `@astrojs/cloudflare` v13 dropped Pages support entirely. The deployment target is Cloudflare Workers only. `wrangler deploy` is correct; `wrangler pages deploy` is wrong for this stack. Any tutorial or ChatGPT suggestion referencing Pages is inapplicable.
- **PR preview deployments require manual CI wiring**: Without additional GitHub Actions config, there are no automatic preview URLs per PR. A workflow that deploys to `stock-helper-pr-${{ github.event.number }}` on PR open and tears it down on close must be written manually.
- **CPU time ≠ response time**: A page that awaits three Supabase round-trips (60 ms wall clock) consumes near-zero CPU-ms. The 10 ms CPU limit almost never fires for I/O-bound SSR. Developers who fear this limit add unnecessary caching for the wrong reason.
- **`nodejs_compat` flag is required, not automatic**: If `wrangler.jsonc` doesn't include `compatibility_flags: ["nodejs_compat"]`, any Node.js API usage (including `crypto`, `stream`, `buffer` — used internally by the Supabase JS client v2) throws a cryptic "not implemented" error at runtime.

## Operational Story

- **Preview deploys**: Not automatic. Must be configured manually via GitHub Actions deploying to a named Worker environment (e.g., `stock-helper-preview`). No dashboard-driven PR previews. Recommend gating branch Workers with Cloudflare Access (Zero Trust) to prevent public access to staging builds before auth is fully hardened.
- **Secrets**: Environment variables and tokens live as Cloudflare Workers Secrets (`SUPABASE_URL`, `SUPABASE_KEY`). Set via `wrangler secret put KEY` — values are encrypted at rest and never appear in deploy logs or `wrangler.jsonc`. Local dev secrets go in `.dev.vars` (gitignored). Rotation: `wrangler secret put KEY` with the new value; Workers pick up the change on the next deploy without restarting.
- **Rollback**: `wrangler rollback` reverts to the previous deployment (< 30 s typical). For a specific version: `wrangler versions list` → `wrangler rollback <VERSION_ID>`. Database migrations do not roll back automatically — schema changes must be manually reverted via Supabase migrations.
- **Approval**: Agents may run `wrangler deploy`, `wrangler tail`, `wrangler versions list`, and `wrangler secret list` unattended. A human must approve: rotating the primary `SUPABASE_KEY`, running any `supabase migration` command, and modifying billing or plan tier.
- **Logs**: `wrangler tail` streams live request logs with filtering (`--status error`, `--search "keyword"`, `--format json`). For structured querying, Cloudflare's Workers Observability MCP server exposes log search as a typed tool callable from Claude Code without leaving the editor.

## Risk Register

| Risk                                                                           | Source           | Likelihood                | Impact          | Mitigation                                                                                                                                          |
| ------------------------------------------------------------------------------ | ---------------- | ------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase connection pool exhaustion (60-conn free limit) at traffic spikes     | Unknown unknowns | Medium                    | High            | Enable Cloudflare Hyperdrive before first public launch; configure Supabase project-level connection pooling (PgBouncer via Supabase dashboard)     |
| Worker library incompatibility (Canvas, CommonJS, native binaries)             | Pre-mortem       | Medium                    | Medium          | Test each new npm dependency with `wrangler dev` (workerd runtime) before merging; avoid libraries with native addon dependencies                   |
| CPU time limit (10 ms free / 30 ms paid) triggering 1101 errors on complex SSR | Devil's advocate | Medium                    | Medium          | Upgrade to Workers Paid ($5/month) before public launch; profile CPU-bound SSR paths; move heavy computation to Supabase RPC if needed              |
| No automatic PR preview URLs                                                   | Unknown unknowns | High (it will be missing) | Low             | Write a GitHub Actions workflow: deploy to named environment on PR open, tear down on close                                                         |
| `astro:env/server` + `wrangler.jsonc` dual-config confusion causing prod 500s  | Devil's advocate | Medium                    | High            | Document both config surfaces in CLAUDE.md; always verify with `wrangler dev` before pushing; add a smoke test that hits `/auth/signin` post-deploy |
| `wrangler.jsonc` misconfigured from toml-format tutorials                      | Unknown unknowns | Medium                    | Low             | Keep `wrangler.jsonc` validated with `wrangler deploy --dry-run` in CI                                                                              |
| `nodejs_compat` flag missing causing cryptic runtime errors                    | Unknown unknowns | Low                       | Medium          | Verify flag is present in `wrangler.jsonc` `compatibility_flags`; add to pre-deploy checklist                                                       |
| Nightly background jobs (alerts) require Queues + second Worker                | Pre-mortem       | Low (post-MVP)            | Low (MVP scope) | Defer to post-MVP; Cloudflare Queues + Scheduled Workers is the correct path when needed                                                            |
| Adapter v13 integration breakage after Astro minor bump                        | Devil's advocate | Medium                    | Medium          | Pin `@astrojs/cloudflare` version in `package.json`; review adapter CHANGELOG before running `npm update`                                           |

## Getting Started

The project is already configured for Cloudflare Workers. These are the exact commands for first deploy and ongoing ops:

1. **Authenticate with Cloudflare**:

   ```bash
   npx wrangler login
   ```

   Opens a browser OAuth flow. Scope the resulting API token to Workers + this project only — no DNS, no billing, no other projects.

2. **Set production secrets** (do this before the first deploy):

   ```bash
   npx wrangler secret put SUPABASE_URL
   npx wrangler secret put SUPABASE_KEY
   ```

   Each command prompts for the value interactively. Secrets are encrypted server-side and injected as environment variables at runtime. The `@astrojs/cloudflare` adapter reads them via `astro:env/server`.

3. **Verify the build compiles for workerd**:

   ```bash
   npm run build
   ```

   Runs `astro build` with the Cloudflare adapter (via the Cloudflare Vite plugin) and emits a Workers-compatible bundle. A successful build here means the deploy will succeed.

4. **Deploy to production**:

   ```bash
   npx wrangler deploy
   ```

   Uploads the bundle, returns a `*.workers.dev` URL within ~30 seconds. The Worker is live. **Do NOT use `wrangler pages deploy`** — that targets the deprecated Pages path; this adapter targets Workers only.

5. **Tail live logs** (after deploy or during debugging):

   ```bash
   npx wrangler tail --format json
   # Filter to errors only:
   npx wrangler tail --status error
   ```

6. **Rollback if needed**:
   ```bash
   npx wrangler rollback                   # reverts to previous deployment
   npx wrangler versions list              # to inspect available versions
   npx wrangler rollback <VERSION_ID>      # to pin to a specific version
   ```

## Out of Scope

The following were not evaluated in this research:

- Docker image configuration
- CI/CD pipeline setup (GitHub Actions wiring for preview deployments)
- Production-scale architecture (multi-region, HA, DR)
