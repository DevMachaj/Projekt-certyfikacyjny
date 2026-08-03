import { ANTHROPIC_API_KEY } from "astro:env/server";
import { buildDeterministicPlan, type RestockCandidate, type RestockPlan } from "@/lib/restocking";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MODEL = "claude-haiku-4-5";
const MAX_TOKENS = 2048;
const TIMEOUT_MS = 20_000;

/**
 * How many of the most-urgent candidates are sent to the model. Candidates arrive ordered
 * most-urgent-first, so this is a prefix, not a sample.
 *
 * Both cost and latency scale with the item count, and a real catalog outgrew the unbounded version:
 * 57 candidates needed ~2550 output tokens and ~14.5s, so it blew the token cap *and* the timeout and
 * silently degraded to the deterministic plan on every request. Capping the prompt keeps both flat as
 * the catalog grows (~860 tokens / ~6.5s at this limit) instead of failing again at the next size.
 *
 * Items beyond the cap are **not** dropped from the plan — `buildDeterministicPlan` still receives every
 * candidate, and `mergeAiReasons` only overwrites reasons the model actually supplied, so the tail keeps
 * its deterministic reason. The AI's contribution stays the headline plus the reasons that matter most.
 */
const AI_ITEM_LIMIT = 20;

/**
 * The model returns **only** a headline plus a per-product `reason` keyed by product name. The
 * item list, order, actions, and quantities are always the engine-built deterministic plan — the
 * merge keys AI reasons onto engine items by exact name (`mergeAiReasons`), so a hallucinated or
 * prompt-injected response can only affect the headline and reason prose, never a displayed
 * product, quantity, action, or order. `additionalProperties: false` + `required` per the
 * structured-outputs contract.
 */
const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    headline: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          product: { type: "string" },
          reason: { type: "string" },
        },
        required: ["product", "reason"],
      },
    },
  },
  required: ["headline", "items"],
} as const;

const SYSTEM_PROMPT =
  "You are writing a prioritized weekly restocking decision for a small-business owner. " +
  "You receive a JSON list of products the inventory engine has already decided on, ordered most-urgent first, " +
  "each with its state, action, units, daysOfStock (days of stock left), leadTime (reorder lead time in days), and velocity. " +
  "Write a one-sentence headline framing the week's priorities, then for each product one short sentence explaining " +
  "WHY it needs attention now, grounded in the supplied numbers (e.g. days of stock against the lead time). " +
  "Do NOT change the order, the actions, the quantities, or invent products — those are already decided by the engine. " +
  "Reference each product by its exact name in the items array.";

/**
 * Record *why* a request degraded to the deterministic plan. The UI renders every failure path as the
 * same "Podsumowanie AI niedostępne" note, so without this the cause is unrecoverable in production
 * (Cloudflare `observability` is on — these surface in `wrangler tail` and the Workers dashboard).
 * Only the reason, HTTP status, and Anthropic's own error envelope are logged — never the API key.
 */
function logFallback(reason: string, detail: string, total: number, prompted: number): void {
  // eslint-disable-next-line no-console -- deliberate server-side diagnostic; the UI cannot surface the cause
  console.warn(`[restocking-summary] fallback reason=${reason} candidates=${total} prompted=${prompted} ${detail}`);
}

/** Thrown when the AI summary feature is not configured (no `ANTHROPIC_API_KEY`). Routes map this to a 503. */
export class AiUnconfiguredError extends Error {
  constructor() {
    super("AI summary is not configured");
    this.name = "AiUnconfiguredError";
  }
}

/** Null-guard on the Anthropic key, mirroring `createClient` in `src/lib/supabase.ts`. */
export function isConfigured(): boolean {
  return Boolean(ANTHROPIC_API_KEY);
}

/** The AI-authored prose contract: a headline plus a reason per product (matched back by name). */
export interface AiPlanResponse {
  headline: string;
  items: { product: string; reason: string }[];
}

/**
 * Validate an Anthropic Messages API response down to `{ headline, items: [{ product, reason }] }`.
 * Pure and total — returns `null` on any structural mismatch (missing/empty content, non-text block,
 * truncated or non-JSON text, missing/non-string `headline`, `items` not an array, or any item
 * missing a string `product`/`reason`) so the caller falls back.
 */
export function parsePlanResponse(body: unknown): AiPlanResponse | null {
  if (typeof body !== "object" || body === null) return null;
  const content = (body as { content?: unknown }).content;
  if (!Array.isArray(content) || content.length === 0) return null;
  const first: unknown = content[0];
  if (typeof first !== "object" || first === null) return null;
  const text = (first as { text?: unknown }).text;
  if (typeof text !== "string") return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const headline = (parsed as { headline?: unknown }).headline;
  const rawItems = (parsed as { items?: unknown }).items;
  if (typeof headline !== "string" || !Array.isArray(rawItems)) return null;

  const items: { product: string; reason: string }[] = [];
  for (const raw of rawItems) {
    if (typeof raw !== "object" || raw === null) return null;
    const product = (raw as { product?: unknown }).product;
    const reason = (raw as { reason?: unknown }).reason;
    if (typeof product !== "string" || typeof reason !== "string") return null;
    items.push({ product, reason });
  }
  return { headline, items };
}

/**
 * Overlay the AI's prose onto the engine-built plan. The AI headline replaces the engine `headline`, and
 * each engine item's `reason` is replaced **only** when the AI supplied a reason for that exact
 * `product` name. Engine items are the iteration source, so a product the AI invented is silently
 * dropped, and an engine item the AI omitted keeps its deterministic reason. Order, action, units,
 * and facts are never touched — they stay engine-authoritative.
 */
export function mergeAiReasons(plan: RestockPlan, parsed: AiPlanResponse): RestockPlan {
  const reasonByProduct = new Map(parsed.items.map((it) => [it.product, it.reason]));
  return {
    headline: parsed.headline,
    items: plan.items.map((item) => {
      const aiReason = reasonByProduct.get(item.product);
      return aiReason ? { ...item, reason: aiReason } : item;
    }),
  };
}

/**
 * Turn the engine's candidates into a prioritized plan with an AI-authored headline and per-item
 * reasons, degrading to the deterministic plan on any failure.
 *
 * The deterministic plan is built first and is the single source of truth for order, items, actions,
 * quantities, and facts; the AI contributes only the headline and reason prose, merged back by
 * product name (`mergeAiReasons`). Throws `AiUnconfiguredError` when no key is set (route → 503). Any
 * other failure — non-2xx, a `stop_reason` other than `end_turn`, unparseable output, network error,
 * or timeout — is caught here and resolves to `source: "fallback"`; it is never propagated.
 *
 * The plan is built from **every** candidate, but only the `AI_ITEM_LIMIT` most urgent are sent to the
 * model, so prompt size and latency stay bounded on large catalogs. Items past the cap keep their
 * deterministic reason.
 */
export async function summarizeRestockPlan(
  candidates: RestockCandidate[],
): Promise<RestockPlan & { source: "ai" | "fallback" }> {
  const plan = buildDeterministicPlan(candidates);
  const prompted = candidates.slice(0, AI_ITEM_LIMIT);

  if (!ANTHROPIC_API_KEY) {
    throw new AiUnconfiguredError();
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, TIMEOUT_MS);
  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: JSON.stringify({ candidates: prompted }) }],
        output_config: { format: { type: "json_schema", schema: PLAN_SCHEMA } },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      // Body is an Anthropic error envelope ({ error: { type, message } }) — never the key.
      logFallback(
        "http_error",
        `status=${res.status} body=${(await res.text()).slice(0, 300)}`,
        candidates.length,
        prompted.length,
      );
      return { ...plan, source: "fallback" };
    }
    const data = (await res.json()) as { stop_reason?: string; usage?: { output_tokens?: number } };
    // A "refusal" or "max_tokens" stop_reason yields unusable/truncated JSON — fall back.
    if (data.stop_reason !== "end_turn") {
      logFallback(
        "stop_reason",
        `stop_reason=${data.stop_reason} output_tokens=${data.usage?.output_tokens} max_tokens=${MAX_TOKENS}`,
        candidates.length,
        prompted.length,
      );
      return { ...plan, source: "fallback" };
    }

    const parsed = parsePlanResponse(data);
    if (!parsed) {
      logFallback("unparseable", "response did not match the plan contract", candidates.length, prompted.length);
      return { ...plan, source: "fallback" };
    }

    return { ...mergeAiReasons(plan, parsed), source: "ai" };
  } catch (e) {
    // Network error, timeout/abort, or malformed JSON — degrade to the deterministic plan.
    const err = e instanceof Error ? e : undefined;
    const aborted = err?.name === "AbortError";
    logFallback(
      aborted ? "timeout" : "exception",
      aborted ? `exceeded TIMEOUT_MS=${TIMEOUT_MS}` : `${err?.name ?? "unknown"}: ${err?.message ?? String(e)}`,
      candidates.length,
      prompted.length,
    );
    return { ...plan, source: "fallback" };
  } finally {
    clearTimeout(timeout);
  }
}
