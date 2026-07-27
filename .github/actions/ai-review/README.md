# AI code review agent

One bounded Messages API call that scores a pull-request diff against
`context/foundation/definition-of-done.md` and emits a verdict plus rendered markdown.

Zero dependencies, plain `fetch`, Node 22. The composite action that runs this in CI holds the
`ANTHROPIC_API_KEY` and deliberately runs no `npm ci`, which keeps the entire npm supply chain out
of the one job that holds the key — so there is no `node_modules` at runtime and no SDK import.

## Files

| File              | Role                                                              |
| ----------------- | ----------------------------------------------------------------- |
| `review.mjs`      | Pure functions + one I/O function (`runReview`). CLI entry point. |
| `prompt.mjs`      | `buildSystemPrompt`, `buildUserPrompt`, `REVIEW_SCHEMA`.          |
| `review.test.mjs` | Unit tests for the pure functions. Collected by `npm test`.       |

## Run it locally

This is the loop the rubric gets tuned in — far cheaper than iterating through CI.

```bash
# 1. Save a real diff. Three dots is non-negotiable: gh pr diff proxies the pulls API and
#    matches GitHub's PR UI, while two-dot (main..HEAD) drifts as main moves.
gh pr diff 8 --patch > /tmp/pr.diff

# 2. Run against it.
ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
PR_TITLE="$(gh pr view 8 --json title --jq .title)" \
PR_BODY="$(gh pr view 8 --json body --jq .body)" \
DIFF_PATH=/tmp/pr.diff \
DOD_PATH=context/foundation/definition-of-done.md \
node .github/actions/ai-review/review.mjs
```

With no `COMMENT_PATH` / `SUMMARY_PATH` set, the rendered comment goes to stdout followed by a
single JSON line (`{"verdict":…,"reason":…,"findings_count":…}`). That JSON line is what the
composite action parses; everything before it is for you.

**Tuning the rubric.** Point `DOD_PATH` at the working-tree copy to test a rubric edit before it
merges. CI deliberately does not do this — it reads the DoD from the base branch, so a pull request
cannot weaken the rubric it is judged by.

## Environment

| Variable            | Required | Default         | Notes                                                     |
| ------------------- | -------- | --------------- | --------------------------------------------------------- |
| `ANTHROPIC_API_KEY` | yes      | —               | Never logged, never echoed.                               |
| `PR_TITLE`          | yes      | —               | Untrusted. Read from the environment, never from `argv`.  |
| `PR_BODY`           | yes      | —               | Untrusted. May be empty; the variable must still be set.  |
| `DIFF_PATH`         | yes      | —               | Path to a saved unified diff.                             |
| `DOD_PATH`          | yes      | —               | Path to the Definition of Done.                           |
| `MODEL`             | no       | `claude-opus-5` |                                                           |
| `EFFORT`            | no       | `medium`        | `low` \| `medium` \| `high` \| `xhigh` \| `max`.          |
| `MAX_TOKENS`        | no       | `16000`         | Caps thinking **and** output together — keep it generous. |
| `TIMEOUT_MS`        | no       | `240000`        | Abort is cleared in `finally`.                            |
| `MAX_DIFF_BYTES`    | no       | `300000`        | Cut on `diff --git` boundaries, never mid-hunk.           |
| `ENABLE_FALLBACK`   | no       | `1`             | `0` drops the refusal fallback and its beta header.       |
| `BASE_REF`          | no       | `main`          | Cosmetic; named in the comment footer.                    |
| `COMMENT_PATH`      | no       | —               | Write the PR comment markdown here instead of stdout.     |
| `SUMMARY_PATH`      | no       | —               | Write the job summary (comment + debug table) here.       |

## Design notes worth knowing before you edit

**The verdict is computed in JavaScript, not asked for from the model.** The schema requires
`severity` and `confidence` on every finding; `computeVerdict` fails on a critical finding with
non-low confidence in `correctness_reliability` or `security_isolation`. Tune the gate by editing
that predicate — no re-prompting, no eval drift. Published guidance for this model generation is
explicit that telling a reviewer to "only report high-severity issues" makes it report _less_, so
the prompt asks for everything and this file filters.

**Do not add verification instructions to the prompt.** "Include a final verification step", "use a
subagent to verify" — the published guidance for this model says to remove them; they cause
over-verification with no quality gain. Their absence is deliberate and inverts the usual
self-check advice.

**`stop_reason` is checked before `content` is touched.** A refusal arrives as HTTP 200 with empty
or partial content, so an unconditional `content[0]` read throws — and refusals are likeliest on
exactly the auth/RLS/CSRF diffs this reviewer most needs to see.

**`parseReviewResponse` scans for the first text block.** Thinking is on by default on this model,
so `content[0]` is usually a thinking block. Indexing blindly would make every real response
`unparseable`.

**Refusal fallback is on by default.** `fallbacks: "default"` re-runs a declined request on the
recommended substitute model server-side, routed by refusal category, which turns a false-positive
cyber-category refusal on a security diff into a real review. Set `ENABLE_FALLBACK=0` to drop it
along with its beta header if the beta is ever unavailable on the account.

## Failure modes

Every path resolves to `verdict: "error"` with a recorded reason — it never throws, and never
prints the key.

| Condition                              | `reason`                |
| -------------------------------------- | ----------------------- |
| Missing/empty required env var         | `unconfigured`          |
| `DIFF_PATH` / `DOD_PATH` unreadable    | `unreadable_input`      |
| Non-2xx from the API                   | `http_error`            |
| `stop_reason === "refusal"`            | `refusal`               |
| `stop_reason === "max_tokens"`         | `truncated`             |
| Any other non-`end_turn` `stop_reason` | `stop_reason`           |
| Response fails `parseReviewResponse`   | `unparseable`           |
| Abort / network / bad JSON             | `timeout` / `exception` |

## Tests

```bash
npm test            # collects .github/actions/ai-review/*.test.mjs alongside src/**
npx eslint .github/actions/ai-review/
```

`eslint.config.js` carries a non-type-checked block for `.github/actions/**/*.mjs`. Without it
`eslint .` hard-fails with `was not found by the project service`: `tsconfig.json` includes `**/*`,
but TypeScript's wildcard matching excludes dot-prefixed directories, so `.github/**` is outside
the project. That block and these files have to stay in the same commit.
