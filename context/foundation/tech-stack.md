---
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
  has_ai: true
  has_background_jobs: false
---

## Why this stack

StockHelper is a solo, 3-week after-hours web app with auth and a relational data layer (products + sales entries + velocity classification). The `10x-astro-starter` (Astro 6 + React 19 + Supabase + Cloudflare) is the registry's recommended default for `(web-app, js)` and clears all four agent-friendly gates: TypeScript end-to-end, file-based routing conventions, high training-data coverage, and current docs. Supabase delivers PostgreSQL + auth out of the box, directly satisfying FR-001 (email + password or OAuth) and the relational data model without extra wiring. Cloudflare Pages gives edge deployment on a generous free tier, native to the starter's architecture. A tight 3-week solo timeline benefits from the least-surprising stack; this starter eliminates auth plumbing, database setup, and deploy config that would otherwise consume the first week. CI runs on GitHub Actions with auto-deploy on merge — no additional configuration needed.
