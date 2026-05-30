---
bootstrapped_at: 2026-05-24T14:48:00Z
starter_id: 10x-astro-starter
starter_name: "10x Astro Starter (Astro + Supabase + Cloudflare)"
project_name: stock-helper
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: stock-helper
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
```

**Why this stack:**

StockHelper is a solo, 3-week after-hours web app with auth and a relational data layer (products + sales entries + velocity classification). The `10x-astro-starter` (Astro 6 + React 19 + Supabase + Cloudflare) is the registry's recommended default for `(web-app, js)` and clears all four agent-friendly gates: TypeScript end-to-end, file-based routing conventions, high training-data coverage, and current docs. Supabase delivers PostgreSQL + auth out of the box, directly satisfying FR-001 (email + password or OAuth) and the relational data model without extra wiring. Cloudflare Pages gives edge deployment on a generous free tier, native to the starter's architecture. A tight 3-week solo timeline benefits from the least-surprising stack; this starter eliminates auth plumbing, database setup, and deploy config that would otherwise consume the first week. CI runs on GitHub Actions with auto-deploy on merge — no additional configuration needed.

## Pre-scaffold verification

| Signal      | Value   | Severity | Notes                                                  |
| ----------- | ------- | -------- | ------------------------------------------------------ |
| npm package | not run | —        | cmd_template starts with `git clone`; npm step skipped |
| GitHub repo | not run | —        | `gh` CLI not installed; recency check unavailable      |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone (clone starter repo without keeping its git history)
**Exit code**: 0
**Files moved**: 20 (`.env.example`, `.github`, `.gitignore`, `.husky`, `.nvmrc`, `.prettierrc.json`, `.vscode`, `CLAUDE.md`, `README.md`, `astro.config.mjs`, `components.json`, `eslint.config.js`, `node_modules`, `package-lock.json`, `package.json`, `public`, `src`, `supabase`, `tsconfig.json`, `wrangler.jsonc`)
**Conflicts (.scaffold siblings)**: none
**.gitignore handling**: moved silently (no prior .gitignore in cwd)
**.bootstrap-scaffold cleanup**: deleted

**Node.js engine warning**: Many packages require Node >=20 or >=22; current runtime is Node v18.20.7. The install completed successfully (npm installed with warnings only). Consider upgrading to Node 22 before running `npm run dev` or `npm run build` — some packages may behave incorrectly or fail at runtime on Node 18.

## Post-scaffold audit

**Tool**: `npm audit --json`
**Summary**: 0 CRITICAL, 1 HIGH, 9 MODERATE, 0 LOW
**Direct vs transitive**: 2 direct moderate (`@astrojs/check`, `wrangler`); all others transitive

#### HIGH findings

- **devalue** v5.6.3–5.8.0 — `GHSA-77vg-94rm-hx3p`: Svelte devalue: DoS via sparse array deserialization (CVSS 7.5, CWE-770). Transitive (not a direct dependency). Fix available: `npm audit fix`.

#### MODERATE findings

| Package                    | Direct? | Advisory                                                               | Fix available?                                        |
| -------------------------- | ------- | ---------------------------------------------------------------------- | ----------------------------------------------------- |
| `@astrojs/check`           | yes     | via `@astrojs/language-server` → `volar-service-yaml` chain            | Downgrade to `@astrojs/check@0.9.2` (breaking change) |
| `@astrojs/language-server` | no      | via `volar-service-yaml` → `yaml-language-server` → `yaml`             | Linked to `@astrojs/check` fix                        |
| `@cloudflare/vite-plugin`  | no      | via `miniflare`, `wrangler`, `ws`                                      | `npm audit fix`                                       |
| `miniflare`                | no      | via `ws` (uninitialized memory disclosure)                             | `npm audit fix`                                       |
| `volar-service-yaml`       | no      | via `yaml-language-server` → `yaml` (stack overflow)                   | Linked to `@astrojs/check` fix                        |
| `wrangler`                 | yes     | via `miniflare`                                                        | `npm audit fix`                                       |
| `ws`                       | no      | `GHSA-58qx-3vcg-4xpx`: uninitialized memory disclosure (CVSS 4.4)      | `npm audit fix`                                       |
| `yaml`                     | no      | `GHSA-48c2-rrv3-qjmp`: stack overflow on deeply nested YAML (CVSS 4.3) | Linked to `@astrojs/check` fix                        |
| `yaml-language-server`     | no      | via `yaml`                                                             | Linked to `@astrojs/check` fix                        |

Most moderate findings are dev-tooling (linter, language server, Cloudflare local dev) and do not affect the production runtime. The HIGH `devalue` finding and the `ws` findings are also transitive dev-tooling; assess per your risk tolerance.

## Hints recorded but not acted on

| Hint                    | Value                |
| ----------------------- | -------------------- |
| bootstrapper_confidence | first-class          |
| quality_override        | false                |
| path_taken              | standard             |
| self_check_answers      | null                 |
| team_size               | solo                 |
| deployment_target       | cloudflare-pages     |
| ci_provider             | github-actions       |
| ci_default_flow         | auto-deploy-on-merge |
| has_auth                | true                 |
| has_payments            | false                |
| has_realtime            | false                |
| has_ai                  | false                |
| has_background_jobs     | false                |

## Next steps

Next: run `/10x-agents-md` to set up agent context (`CLAUDE.md`, `AGENTS.md`). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:

- Upgrade Node.js to v22 (the starter requires it; `.nvmrc` in the project root specifies the version).
- `git init` (if you have not already) to start your own repo history.
- Review the `CLAUDE.md` the starter ships — the next skill (`/10x-agents-md`) will review and extend it.
- Run `npm audit fix` to address the patchable MODERATE and HIGH findings (the `@astrojs/check` group requires a breaking downgrade — review before applying `--force`).
- Address audit findings per your project's risk tolerance — the full breakdown is in this log.
