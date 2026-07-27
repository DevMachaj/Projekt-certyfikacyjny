# One-time repository setup

Everything the AI reviewer needs that lives in GitHub rather than in the repository. Run once per
repository; re-running the label commands is safe (`--force` updates in place).

## Labels

The workflow applies exactly one `ai-review:` label per run and removes the other two. They follow
the existing `<group>: <value>` convention already used by `status: ready` / `status: proposed`.

```bash
gh label create "ai-review: pass"  --color 0E8A16 --description "AI reviewer found no blocking findings" --force
gh label create "ai-review: fail"  --color D73A4A --description "AI reviewer found a blocking finding (advisory — does not block merge)" --force
gh label create "ai-review: error" --color CFD3D7 --description "AI review could not complete; see the job summary" --force
gh label create "skip-ai-review"   --color CFD3D7 --description "Skip the AI reviewer on this PR" --force
```

All four must exist before the workflow's first run — a missing label makes the labelling step
fail rather than the review.

`skip-ai-review` is read by the job-level `if:` in `.github/workflows/ai-review.yml`. Add it to a
PR to suppress the reviewer; `[skip review]` in the PR title does the same thing.

## Actions secret

```bash
gh secret set ANTHROPIC_API_KEY
# → prompts "Paste your secret:"; paste, then Enter
```

**This is the Actions secret only.** It is a distinct credential surface from the Cloudflare
production secret, which goes in exclusively via `wrangler secret put` — CI never deploys, and
nothing in this change touches that path. Scoping a separate API key to CI limits the blast radius
of a review run to review runs.

> ⚠️ `gh secret set NAME` with no `--body` reads the value from **stdin**. Run from a
> non-interactive shell (a script, or an agent's shell), stdin is empty and it silently creates the
> secret with an **empty value** — `gh secret list` then shows the name with a fresh timestamp
> while `${{ secrets.NAME }}` interpolates to `""`. This happened during Phase 4. To set it
> non-interactively, pipe the value in explicitly:
>
> ```bash
> printf '%s' "$KEY" | gh secret set ANTHROPIC_API_KEY
> ```
>
> The action's own input validation catches the empty case with an explicit message rather than
> letting it surface as a confusing `401 invalid x-api-key` from the API.

## Verifying the setup

```bash
gh label list --limit 40 --json name --jq '.[] | select(.name | test("ai-review|skip-ai")) | .name'
gh secret list

# Manual review run against any PR, read-only (posts no comment, applies no label):
gh workflow run ai-review-manual.yml --ref main -f pr-number=<N>
```

## What is deliberately NOT set up here

- **Branch protection.** `main` has none, and this change does not add any. Making the check
  required is Phase 6, gated on the calibration criteria in the plan.
- **Production secrets.** `wrangler secret put` only; CI never deploys.
