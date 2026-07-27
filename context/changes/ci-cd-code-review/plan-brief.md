# CI/CD AI Code-Review Pipeline — Plan Brief

> Full plan: `context/changes/ci-cd-code-review/plan.md`
> Research: `context/changes/ci-cd-code-review/research.md`

## What & Why

Add the repo's first AI-assisted quality gate: a GitHub Actions workflow that, on every PR to `main`, sends the PR title, body, and three-dot diff to Claude in one bounded API call, scores it against a new Definition of Done, and reports a scorecard as a sticky PR comment, a job summary, and an `ai-review:` label.

The motivation is measured, not assumed. Of 49 DoD criteria mined from `CLAUDE.md`, `lessons.md`, `test-plan.md`, and nine archived `impl-review.md` reports, only **5 are enforced by CI today and 41 can only be checked by a human or an LLM**. That is a genuinely large addressable surface — the reviewer is not redundant with lint here.

## Starting Point

`.github/workflows/ci.yml` is the entire `.github/` tree: `lint → test → build`, no `permissions:` block, no `concurrency`, actions two majors behind and unpinned. `npm run typecheck` and `npm run depcruise` exist as scripts and run **nowhere in CI** — typecheck only in a bypassable husky hook — so a `--no-verify` commit currently ships type errors through a green PR. `test-plan.md:121` claims typecheck is wired; it is not.

No Definition of Done exists anywhere. `ANTHROPIC_API_KEY` is already a declared app secret (`astro.config.mjs:21`) consumed by `src/lib/services/restocking-summary.ts`, but is not exposed to Actions. The repo is public, `main` has no branch protection, and there are zero bot commits in its entire history.

## Desired End State

Opening a PR from a branch in this repo produces, within ~2 minutes and unprompted: one sticky comment with a dimension scorecard, up to 10 severity-sorted findings with `file:line` locations, and a top-3-actions list; the same content plus token counts in the job summary; and exactly one of `ai-review: pass | fail | error`. The check is **always green** — this ships advisory. Docs-only and fork PRs skip cleanly (a real `skipped` status, not Pending).

## Key Decisions Made

| Decision                         | Choice                                                     | Why (1 sentence)                                                                                                                                                                                  | Source                                        |
| -------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Agent architecture               | One `messages.parse`-shaped call, hand-assembled           | The task isn't agentic — all inputs known up front; constrained decoding gives a stronger verdict guarantee than the Agent SDK at ~10× lower cost.                                                | Research                                      |
| Model                            | `claude-opus-5` at effort `medium`                         | Docs state Opus 5 code review is high-precision _and_ high-recall and holds accuracy at lower effort; the cost delta at this PR volume is ~3¢/PR, so quality is the binding constraint, not cost. | Plan (diverges from research's Sonnet 5 pick) |
| SDK                              | Zero-dependency `.mjs`, global `fetch`                     | Mirrors the proven `restocking-summary.ts` pattern and removes the entire npm supply-chain surface from the one job holding the API key.                                                          | Plan                                          |
| Verdict computation              | In JavaScript, not the model                               | Anthropic's published guidance: asking the model to filter by severity makes it report _less_; ask for everything, filter in a separate pass.                                                     | Research                                      |
| Gate mode at launch              | Advisory, always `exit 0`                                  | Calibrate the rubric against real PRs before it can block you; `continue-on-error` was rejected as a fake-green check.                                                                            | Plan                                          |
| DoD runtime source               | Read from the **base branch**                              | One source of truth, and a PR cannot weaken the rubric it is judged by.                                                                                                                           | Plan                                          |
| DoD prompt scope                 | Full 49 criteria, ordered by the archive's failure ranking | Nothing silently uncovered, while attention still goes where bugs have actually occurred.                                                                                                         | Plan                                          |
| Plan-adherence criteria (#44–47) | Skipped in CI                                              | Branch names don't map to change-ids here; keeping the agent diff-only is the basis of the one-call architecture.                                                                                 | Plan                                          |
| On API failure / refusal         | Fail open, loudly                                          | Matches the deterministic-fallback precedent; an Opus 5 cyber-classifier false positive is likeliest on exactly the auth/RLS diffs you most want reviewed.                                        | Plan                                          |
| Trigger & security model         | `pull_request` + same-repo guard                           | Fork PRs get no secrets and no write token by design; `pull_request_target` was rejected as the dangerous alternative.                                                                            | Research                                      |
| Docs-only skip                   | Job-level `if:`, never workflow `paths:`                   | Workflow-level filters leave a check **Pending**, and Pending blocks a required check forever.                                                                                                    | Research                                      |
| CI gaps                          | Folded in as Phase 1                                       | ~4 lines removes two DoD criteria from the LLM's plate and closes the biggest real hole before the reviewer exists.                                                                               | Plan                                          |

## Scope

**In scope:** typecheck + depcruise in CI, `ci.yml` hardening (permissions, SHA pins, Node pin, concurrency); `context/foundation/definition-of-done.md`; the agent script + prompt + schema + unit tests; a local composite action; the PR workflow with comment, job summary, and labels; the `ANTHROPIC_API_KEY` Actions secret.

**Out of scope:** the Claude Agent SDK and `claude-code-action`; any repo reading by the agent; plan-adherence scoring; failing the build; required checks; `pull_request_target`; E2E, coverage thresholds, Stryker, `npm audit`, CodeQL, Dependabot.

## Architecture / Approach

```
PR → ai-review.yml (pull_request, same-repo/draft/bot/label guards, job-level docs skip)
       └→ .github/actions/ai-review  (composite)
            ├─ gh pr diff --patch --exclude …        (three-dot, as data — no PR-head checkout)
            ├─ git show origin/main:…/definition-of-done.md   (rubric from BASE branch)
            └─ node review.mjs → one POST /v1/messages, output_config{effort, format:json_schema}
                 └→ findings[] with severity+confidence  →  computeVerdict() in JS
       └→ sticky comment + $GITHUB_STEP_SUMMARY + ai-review: label   → exit 0
```

Recall and precision are split across stages: the model reports everything (recall), JavaScript clamps, sorts, caps, and decides (precision) — mirroring both Anthropic's prompting guidance and its own managed reviewer's architecture.

## Phases at a Glance

| Phase                  | What it delivers                                                          | Key risk                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 1. Close CI gaps       | typecheck + depcruise wired; `ci.yml` hardened                            | 4 never-executed `depcruise` error rules may fail immediately and need a fix-vs-downgrade call                       |
| 2. Definition of Done  | `context/foundation/definition-of-done.md`, 49 criteria, ownership header | The rubric is the expensive thing to get wrong; everything downstream is plumbing                                    |
| 3. The agent           | `.mjs` + prompt + schema + unit tests, runnable locally                   | `npm run lint` **hard-fails** on any `.mjs` under `.github/` — verified; the config fix must land in the same commit |
| 4. Composite action    | Diff fetch, base-branch DoD, verdict outputs                              | Script injection via PR title/body; composite actions get neither `secrets` nor `INPUT_*` automatically              |
| 5. PR workflow         | Trigger, guards, comment, summary, labels — advisory                      | The job `name:` becomes the required-check name in Phase 6; renaming it later silently unrequires it                 |
| 6. Blocking (deferred) | Documented flip to `exit 1` + required check                              | Not executed; entry criteria decided now while the reasoning is fresh                                                |

**Prerequisites:** `ANTHROPIC_API_KEY` as a repository secret (before Phase 5); Phase 2's DoD merged to `main` (Phase 4 reads it from the base branch); the four `ai-review:` / `skip-ai-review` labels created.
**Estimated effort:** ~4–6 sessions. Phases 1, 4, 5 are short; Phase 2 (rubric authoring) and Phase 3 (prompt iteration against saved diffs) carry most of the work.

## Open Risks & Assumptions

- **`depcruise` has never run.** Phase 1 may surface violations that need real architectural decisions before anything else can land.
- **Opus 5's cyber classifier can refuse.** Auth, RLS, and CSRF diffs are exactly what the reviewer most needs to see and exactly what can trip a false positive. Mitigated by fail-open plus a distinct `error` label — but it means some security diffs may go unreviewed, silently except for the label.
- **`gh pr diff`'s three-dot semantics are inferred, not documented.** It proxies the pulls API and GitHub documents the PR _UI_ as three-dot. If exactness ever matters, switch to `git diff --merge-base`, where the semantics are in `git-diff(1)`.
- **Prompt-injection defence is delimiters plus a data-not-instructions directive.** That is the baseline. Whether it suffices for a public repo that later accepts fork PRs is unresolved — though the fork guard means it does not matter yet.
- **`actions/checkout` changed 7 days before the research.** It now refuses fork-PR checkout under `pull_request_target`/`workflow_run`; SHA-pinned workflows did not pick this up automatically. Not an issue for `pull_request`, but it is the highest-churn item here.
- **Assumed:** PR volume stays low enough that per-PR cost is irrelevant and prompt caching never pays.

## Success Criteria (Summary)

- Opening a real PR with an unguarded `db.ts` call in an API route produces a CRITICAL finding citing the `lessons.md` criterion, an `ai-review: fail` label, and a still-green check.
- A `context/`-only PR shows a genuinely `skipped` job and makes no model call.
- An invalid API key produces a "review unavailable" comment, an `ai-review: error` label, a `::warning::` annotation, and a green check — never a silent pass.
