/**
 * CI review agent: one bounded Messages API call that scores a PR diff against the repository's
 * Definition of Done and emits a machine-readable verdict plus rendered markdown.
 *
 * Structured as pure functions plus a single I/O function, mirroring
 * `src/lib/services/restocking-summary.ts` so the two are maintained by the same instincts:
 * zero dependencies over global `fetch`, an AbortController timeout cleared in `finally`, a
 * `stop_reason` guard before any content read, a total parser that returns `null` on structural
 * mismatch, and structured logging that records *why* a request degraded.
 *
 * Zero-dependency on purpose: the composite action that runs this holds the API key and
 * deliberately runs no `npm ci`, which removes the entire npm supply-chain surface from that job.
 * There is no `node_modules` at runtime, so the official SDK is not an option here.
 *
 * Recall vs precision is split across stages. The model is asked to report everything with a
 * severity and a confidence; this file clamps, sorts, caps, and derives the verdict.
 */

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  buildSystemPrompt,
  buildUserPrompt,
  REVIEW_SCHEMA,
  DIMENSIONS,
  SEVERITIES,
  CONFIDENCES,
  VERDICTS,
} from "./prompt.mjs";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

/**
 * Server-side refusal fallback. This model's cyber-category safety classifier can false-positive on
 * exactly the diffs this reviewer most needs to see — auth guards, RLS policies, CSRF posture — and
 * a refusal arrives as HTTP 200 with an empty or partial `content`. `fallbacks: "default"` re-runs a
 * declined request on the recommended substitute model server-side, routed by refusal category, so
 * a false positive on a security diff produces a review instead of a hole. Set `ENABLE_FALLBACK=0`
 * to drop it (and the beta header with it) without touching this file.
 */
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

const MAX_FINDINGS = 10;
const MAX_TOP_ACTIONS = 3;

const DEFAULTS = {
  MODEL: "claude-opus-5",
  EFFORT: "medium",
  MAX_TOKENS: "16000",
  TIMEOUT_MS: "240000",
  MAX_DIFF_BYTES: "300000",
  ENABLE_FALLBACK: "1",
};

const DIMENSION_SET = new Set(DIMENSIONS);
const SEVERITY_SET = new Set(SEVERITIES);
const CONFIDENCE_SET = new Set(CONFIDENCES);
const VERDICT_SET = new Set(VERDICTS);

/** Sort key: critical first, then warning, then observation; high confidence ahead of low. */
const SEVERITY_RANK = { critical: 0, warning: 1, observation: 2 };
const CONFIDENCE_RANK = { high: 0, medium: 1, low: 2 };

/**
 * Blocking = a high-or-medium-confidence CRITICAL in one of the two dimensions that gate.
 * Everything else is advisory. Nine archived reviews produced zero CRITICALs, so this threshold
 * would have blocked nothing historically — and a laxer one would have missed the RLS
 * `WITH CHECK` hole (DoD #9).
 */
const BLOCKING_DIMENSIONS = new Set(["correctness_reliability", "security_isolation"]);

/** True when a single finding is severe enough to fail the gate on its own. */
export const isBlocking = (f) =>
  f.severity === "critical" && f.confidence !== "low" && BLOCKING_DIMENSIONS.has(f.dimension);

/**
 * The deterministic filter. This — not the model — decides pass/fail, so the gate is auditable and
 * tunable without re-prompting.
 */
export function computeVerdict(findings) {
  return findings.some(isBlocking) ? "fail" : "pass";
}

/**
 * Record *why* a run degraded. Every failure path resolves to a `verdict: "error"` result rather
 * than throwing, and the PR comment renders every one of them as the same "review unavailable"
 * note — so without this the cause is unrecoverable. Logs the reason, the HTTP status, and
 * Anthropic's own error envelope; never the API key.
 */
function logFallback(reason, detail) {
  console.warn(`[ai-review] degraded reason=${reason} ${detail}`);
}

function errorResult(reason, detail) {
  return { verdict: "error", reason, detail, review: null };
}

/** Slice to a byte budget without splitting a UTF-8 code point. */
function sliceBytes(text, maxBytes) {
  const buf = Buffer.from(text, "utf8");
  if (buf.length <= maxBytes) return text;
  let end = maxBytes;
  // 0b10xxxxxx marks a continuation byte — back off until we're on a character boundary.
  while (end > 0 && (buf[end] & 0xc0) === 0x80) end--;
  return buf.subarray(0, end).toString("utf8");
}

/**
 * Cut an oversized diff on `diff --git` boundaries.
 *
 * A plain byte cut lands mid-hunk and produces a diff the model will misread — dangling `@@`
 * headers and half-written files read as deletions. Truncating on file boundaries keeps every
 * retained file complete.
 */
export function truncateDiff(diff, maxBytes) {
  if (Buffer.byteLength(diff, "utf8") <= maxBytes) {
    return { diff, truncated: false, droppedFiles: 0 };
  }

  const starts = [];
  const boundary = /^diff --git /gm;
  let match;
  while ((match = boundary.exec(diff)) !== null) starts.push(match.index);

  if (starts.length === 0) {
    // Not a git diff we can split (e.g. a `--name-only` fallback list) — keep a byte prefix.
    return { diff: sliceBytes(diff, maxBytes), truncated: true, droppedFiles: 0 };
  }

  // How many whole files fit? Anything before the first boundary is a preamble kept with file 1.
  let kept = 0;
  for (let i = 0; i < starts.length; i++) {
    const end = i + 1 < starts.length ? starts[i + 1] : diff.length;
    if (Buffer.byteLength(diff.slice(0, end), "utf8") > maxBytes) break;
    kept = i + 1;
  }

  if (kept === 0) {
    // The first file alone blows the budget. Return a byte-capped prefix of it rather than an
    // empty string — an empty diff reads as "nothing changed", which is a lie.
    const firstFileEnd = starts.length > 1 ? starts[1] : diff.length;
    return {
      diff: sliceBytes(diff.slice(0, firstFileEnd), maxBytes),
      truncated: true,
      droppedFiles: starts.length - 1,
    };
  }

  return {
    diff: diff.slice(0, starts[kept]),
    truncated: true,
    droppedFiles: starts.length - kept,
  };
}

function sortFindings(findings) {
  return [...findings].sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence],
  );
}

/**
 * Validate a Messages API response down to a `Review`. Pure and total — returns `null` on any
 * structural mismatch so the caller degrades instead of throwing.
 *
 * Scans `content` for the first text block rather than reading `content[0]`. Thinking is on by
 * default on this model generation, so the JSON is rarely the first block; indexing blindly would
 * make every real response unparseable.
 *
 * Sorting and the 10-finding cap happen here because the schema cannot express them (no
 * `maxItems`, no ordering) — this is the deterministic precision stage.
 */
export function parseReviewResponse(body) {
  if (typeof body !== "object" || body === null) return null;
  const content = body.content;
  if (!Array.isArray(content) || content.length === 0) return null;

  let text = null;
  for (const block of content) {
    if (typeof block !== "object" || block === null) continue;
    if (block.type === "text" && typeof block.text === "string") {
      text = block.text;
      break;
    }
  }
  if (text === null) return null;

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;

  const { summary, scorecard: rawScorecard, findings: rawFindings, top_actions: rawActions } = parsed;
  if (typeof summary !== "string") return null;
  if (!Array.isArray(rawScorecard) || !Array.isArray(rawFindings) || !Array.isArray(rawActions)) return null;

  const scorecard = [];
  for (const raw of rawScorecard) {
    if (typeof raw !== "object" || raw === null) return null;
    const { dimension, verdict, note } = raw;
    if (typeof dimension !== "string" || typeof verdict !== "string" || typeof note !== "string") return null;
    if (!DIMENSION_SET.has(dimension) || !VERDICT_SET.has(verdict)) return null;
    scorecard.push({ dimension, verdict, note });
  }

  const findings = [];
  for (const raw of rawFindings) {
    if (typeof raw !== "object" || raw === null) return null;
    const { dimension, severity, confidence, title, location, detail, fix, criterion } = raw;
    const fields = [dimension, severity, confidence, title, location, detail, fix, criterion];
    if (fields.some((v) => typeof v !== "string")) return null;
    if (!DIMENSION_SET.has(dimension) || !SEVERITY_SET.has(severity) || !CONFIDENCE_SET.has(confidence)) return null;
    findings.push({ dimension, severity, confidence, title, location, detail, fix, criterion });
  }

  const topActions = [];
  for (const raw of rawActions) {
    if (typeof raw !== "string") return null;
    topActions.push(raw);
  }

  return {
    summary,
    scorecard,
    findings: sortFindings(findings).slice(0, MAX_FINDINGS),
    topActions: topActions.slice(0, MAX_TOP_ACTIONS),
  };
}

const SEVERITY_LABEL = { critical: "🔴 CRITICAL", warning: "🟡 WARNING", observation: "🔵 OBSERVATION" };
const VERDICT_LABEL = { pass: "✅ pass", warning: "⚠️ warning", fail: "❌ fail" };
const DIMENSION_LABEL = {
  correctness_reliability: "Correctness & Reliability",
  security_isolation: "Security & Isolation",
  conventions_architecture: "Conventions & Architecture",
  testing: "Testing",
  accessibility_ux: "Accessibility & UX",
};

function renderFindings(findings) {
  if (findings.length === 0) {
    return "No findings. The diff looks good against the Definition of Done.\n";
  }
  const lines = [];
  for (const [i, f] of findings.entries()) {
    lines.push(`### F${i + 1} — ${f.title}`);
    lines.push("");
    lines.push(
      `- **Severity**: ${SEVERITY_LABEL[f.severity]} · **Confidence**: ${f.confidence} · **Dimension**: ${DIMENSION_LABEL[f.dimension]} · **DoD**: ${f.criterion}`,
    );
    lines.push(`- **Location**: \`${f.location}\``);
    lines.push(`- **Detail**: ${f.detail}`);
    lines.push(`- **Fix**: ${f.fix}`);
    lines.push("");
  }
  return lines.join("\n");
}

function renderScorecard(scorecard) {
  if (scorecard.length === 0) return "";
  const rows = scorecard.map((s) => `| ${DIMENSION_LABEL[s.dimension]} | ${VERDICT_LABEL[s.verdict]} | ${s.note} |`);
  return ["| Dimension | Verdict | Note |", "| --- | --- | --- |", ...rows, ""].join("\n");
}

function renderTopActions(topActions) {
  if (topActions.length === 0) return "";
  return ["**Top actions by leverage**", "", ...topActions.map((a, i) => `${i + 1}. ${a}`), ""].join("\n");
}

/**
 * The PR comment. When `review` is null this renders the "review unavailable" path — which is why
 * `meta.reason` must always be populated on a degraded run.
 */
export function renderComment(review, meta) {
  const head = "## 🤖 AI code review";
  if (review === null) {
    return [
      head,
      "",
      `**Review unavailable** — \`${meta.reason ?? "unknown"}\`.`,
      "",
      "The deterministic gates in `ci.yml` are unaffected. See the job summary for the full reason.",
      "",
    ].join("\n");
  }
  return [
    head,
    "",
    `**Verdict: \`${meta.verdict}\`** · ${review.findings.length} finding(s)`,
    "",
    review.summary,
    "",
    renderScorecard(review.scorecard),
    renderFindings(review.findings),
    renderTopActions(review.topActions),
    "---",
    "",
    `<sub>Advisory — this check does not block the merge. Scored against \`context/foundation/definition-of-done.md\` on \`${meta.baseRef ?? "main"}\`.</sub>`,
    "",
  ].join("\n");
}

/**
 * The job summary: the comment plus the debugging detail that does not belong in a PR comment.
 * This surface survives when commenting fails (fork PR, 403, missing scope), so it is the primary
 * place a degraded run is diagnosed.
 */
export function renderSummary(review, meta) {
  const usage = meta.usage ?? {};
  const rows = [
    `| model | \`${meta.model ?? "-"}\` |`,
    `| effort | \`${meta.effort ?? "-"}\` |`,
    `| verdict | \`${meta.verdict}\` |`,
    `| reason | \`${meta.reason ?? "-"}\` |`,
    `| stop_reason | \`${meta.stopReason ?? "-"}\` |`,
    `| input tokens | ${usage.input_tokens ?? "-"} |`,
    `| output tokens | ${usage.output_tokens ?? "-"} |`,
    `| diff bytes | ${meta.diffBytes ?? "-"}${meta.truncated ? ` (truncated, ${meta.droppedFiles} file(s) dropped)` : ""} |`,
  ];
  const detail = meta.detail ? ["", "```", meta.detail, "```", ""] : [""];
  return [
    renderComment(review, meta),
    "---",
    "",
    "### Debug",
    "",
    "| field | value |",
    "| --- | --- |",
    ...rows,
    ...detail,
  ].join("\n");
}

/** Resolve configuration from the environment only — never from `process.argv`. */
export function readConfig(env) {
  const required = ["ANTHROPIC_API_KEY", "PR_TITLE", "PR_BODY", "DIFF_PATH", "DOD_PATH"];
  const missing = required.filter((k) => k !== "PR_BODY" && !env[k]);
  if (missing.length > 0) {
    return { error: `missing or empty: ${missing.join(", ")}` };
  }
  const get = (k) => env[k] || DEFAULTS[k];
  return {
    apiKey: env.ANTHROPIC_API_KEY,
    title: env.PR_TITLE,
    // An empty PR body is legitimate; every other required var must be non-empty.
    body: env.PR_BODY ?? "",
    diffPath: env.DIFF_PATH,
    dodPath: env.DOD_PATH,
    model: get("MODEL"),
    effort: get("EFFORT"),
    maxTokens: Number(get("MAX_TOKENS")),
    timeoutMs: Number(get("TIMEOUT_MS")),
    maxDiffBytes: Number(get("MAX_DIFF_BYTES")),
    enableFallback: get("ENABLE_FALLBACK") !== "0",
    baseRef: env.BASE_REF ?? "main",
  };
}

/**
 * Run one review. Never throws: every failure path resolves to a `verdict: "error"` result with a
 * recorded reason.
 */
export async function runReview(env) {
  const config = readConfig(env);
  if (config.error) {
    logFallback("unconfigured", config.error);
    return { ...errorResult("unconfigured", config.error), meta: { verdict: "error", reason: "unconfigured" } };
  }

  let diffRaw;
  let dodText;
  try {
    diffRaw = readFileSync(config.diffPath, "utf8");
    dodText = readFileSync(config.dodPath, "utf8");
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    logFallback("unreadable_input", detail);
    return { ...errorResult("unreadable_input", detail), meta: { verdict: "error", reason: "unreadable_input" } };
  }

  const { diff, truncated, droppedFiles } = truncateDiff(diffRaw, config.maxDiffBytes);
  const meta = {
    model: config.model,
    effort: config.effort,
    baseRef: config.baseRef,
    diffBytes: Buffer.byteLength(diffRaw, "utf8"),
    truncated,
    droppedFiles,
    verdict: "error",
  };

  const headers = {
    "content-type": "application/json",
    "x-api-key": config.apiKey,
    "anthropic-version": ANTHROPIC_VERSION,
  };
  const payload = {
    model: config.model,
    max_tokens: config.maxTokens,
    system: buildSystemPrompt(dodText),
    messages: [
      {
        role: "user",
        content: buildUserPrompt({ title: config.title, body: config.body, diff, truncated, droppedFiles }),
      },
    ],
    // `effort` and `format` both live inside output_config — `effort` at the top level is ignored.
    output_config: {
      effort: config.effort,
      format: { type: "json_schema", schema: REVIEW_SCHEMA },
    },
  };
  if (config.enableFallback) {
    headers["anthropic-beta"] = FALLBACK_BETA;
    payload.fallbacks = "default";
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, config.timeoutMs);
  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!res.ok) {
      // Body is an Anthropic error envelope ({ error: { type, message } }) — never the key.
      const detail = `status=${res.status} body=${(await res.text()).slice(0, 300)}`;
      logFallback("http_error", detail);
      return { ...errorResult("http_error", detail), meta: { ...meta, reason: "http_error", detail } };
    }

    const data = await res.json();
    meta.usage = data.usage;
    meta.stopReason = data.stop_reason;

    // Check stop_reason BEFORE touching content. On a refusal `content` is empty or partial, so an
    // unconditional read throws — and refusals are likeliest on exactly the auth/RLS/CSRF diffs
    // this reviewer most needs to see. Branch on stop_reason, never on stop_details: the latter is
    // informational and can be null even on a genuine refusal.
    if (data.stop_reason !== "end_turn") {
      const reason =
        data.stop_reason === "refusal" ? "refusal" : data.stop_reason === "max_tokens" ? "truncated" : "stop_reason";
      const category = data.stop_details?.category ?? "-";
      const detail = `stop_reason=${data.stop_reason} category=${category} max_tokens=${config.maxTokens}`;
      logFallback(reason, detail);
      return { ...errorResult(reason, detail), meta: { ...meta, reason, detail } };
    }

    const review = parseReviewResponse(data);
    if (!review) {
      logFallback("unparseable", "response did not match the review contract");
      return {
        ...errorResult("unparseable", "response did not match the review contract"),
        meta: { ...meta, reason: "unparseable" },
      };
    }

    const verdict = computeVerdict(review.findings);
    return { verdict, reason: null, detail: null, review, meta: { ...meta, verdict } };
  } catch (e) {
    const err = e instanceof Error ? e : undefined;
    const aborted = err?.name === "AbortError";
    const reason = aborted ? "timeout" : "exception";
    const detail = aborted
      ? `exceeded TIMEOUT_MS=${config.timeoutMs}`
      : `${err?.name ?? "unknown"}: ${err?.message ?? String(e)}`;
    logFallback(reason, detail);
    return { ...errorResult(reason, detail), meta: { ...meta, reason, detail } };
  } finally {
    clearTimeout(timeout);
  }
}

/** CLI entry point: writes the two markdown surfaces and prints the machine-readable result. */
async function main() {
  const { writeFileSync } = await import("node:fs");
  const result = await runReview(process.env);
  const comment = renderComment(result.review, result.meta);
  const summary = renderSummary(result.review, result.meta);

  if (process.env.COMMENT_PATH) writeFileSync(process.env.COMMENT_PATH, comment, "utf8");
  if (process.env.SUMMARY_PATH) writeFileSync(process.env.SUMMARY_PATH, summary, "utf8");
  if (!process.env.COMMENT_PATH && !process.env.SUMMARY_PATH) console.log(comment);

  console.log(
    JSON.stringify({
      verdict: result.verdict,
      reason: result.reason,
      findings_count: result.review?.findings.length ?? 0,
    }),
  );
  // Always exit 0. The caller owns the exit code so the reviewer can run advisory or blocking
  // without changing this file.
  process.exit(0);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
