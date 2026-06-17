import { recommendationText } from "@/lib/classification";
import type { ProductClassification } from "@/lib/dashboard";

/**
 * One product the engine flagged for the weekly restocking plan, carrying the engine's facts plus
 * a **deterministic** action string. The engine makes every business decision here — the action,
 * the quantity, the selection. A downstream LLM may only reword the summary prose; it never
 * produces this list and can never alter a `units`, `state`, or `action`.
 */
export interface RestockCandidate {
  product: string; // product.name
  state: "Understocked" | "Watch";
  units: number | null; // Understocked only; always null for Watch
  action: string; // deterministic: "Order N units" | "Monitor"
  daysOfStock: number | null;
  leadTime: number | null; // product.lead_time_days; drives the urgency ordering
  velocity: number | null;
}

export interface RestockPlanItem {
  product: string;
  action: string; // engine-built; never AI-authored
  reason: string; // deterministic by default; AI-authored on the "ai" path
  daysOfStock: number | null;
  leadTime: number | null;
  units: number | null;
  state: "Understocked" | "Watch";
}

export interface RestockPlan {
  /** One-sentence headline framing the week. Deterministic by default; AI-authored on the "ai" path. */
  weekly_summary: string;
  items: RestockPlanItem[];
}

/** The two restock-relevant states. */
const RESTOCK_STATES: ReadonlySet<string> = new Set(["Understocked", "Watch"]);

/**
 * Urgency = days of slack before stock falls below the lead-time coverage point
 * (`daysOfStock − leadTime`). Smaller (more negative) is more urgent. Understocked
 * (`daysOfStock < leadTime`) is always negative and Watch (`leadTime ≤ daysOfStock < 2·leadTime`)
 * is in `[0, leadTime)`, so Understocked sorts ahead of Watch for free. Missing facts sort last.
 */
function urgency(c: RestockCandidate): number {
  if (c.daysOfStock == null || c.leadTime == null) return Number.POSITIVE_INFINITY;
  return c.daysOfStock - c.leadTime;
}

/**
 * Select the products that belong in the weekly restocking plan, fix each one's action
 * deterministically, and order them **most urgent first**. Keeps only `Understocked` and `Watch`.
 *
 * The action wording is engine-derived, never LLM-derived: `Understocked` reuses the shared
 * `recommendationText` (→ "Order N units") so it cannot fork from the dashboard/detail views;
 * `Watch` is a literal "Monitor" and never carries a quantity. Ordering is deterministic (the AI
 * never reorders); ties preserve input order (the caller passes products name-sorted).
 */
export function selectRestockCandidates(items: ProductClassification[]): RestockCandidate[] {
  const candidates: RestockCandidate[] = items
    .filter(({ classification }) => RESTOCK_STATES.has(classification.state))
    .map(({ product, classification }) => {
      const state = classification.state as "Understocked" | "Watch";
      const units = classification.recommendation.kind === "order" ? classification.recommendation.units : null;
      const action = state === "Understocked" ? recommendationText(classification.recommendation, state) : "Monitor";
      return {
        product: product.name,
        state,
        units,
        action,
        daysOfStock: classification.daysOfStock,
        leadTime: product.lead_time_days,
        velocity: classification.velocity,
      };
    });

  // Stable sort (Array.prototype.sort is stable) → ties keep input (alphabetical) order.
  return candidates.sort((a, b) => urgency(a) - urgency(b));
}

/**
 * A factual, deterministic one-line reason built only from engine numbers — the default `reason`
 * and the fallback when the LLM is unavailable. Never invents a quantity; for `Watch` it carries no
 * order quantity (Watch never has `units`).
 */
export function deterministicReason(c: RestockCandidate): string {
  const dos = c.daysOfStock == null ? null : Math.round(c.daysOfStock);
  if (c.state === "Understocked") {
    if (dos == null || c.leadTime == null) return "Stock is below the reorder point — order now.";
    return `Only ${dos} day${dos === 1 ? "" : "s"} of stock left, below the ${c.leadTime}-day lead time — order now.`;
  }
  if (dos == null || c.leadTime == null) return "Stock is getting low — keep an eye on it.";
  return `${dos} days of stock against a ${c.leadTime}-day lead time — reorder soon.`;
}

/**
 * Build the deterministic weekly plan straight from the candidates — the single source of truth for
 * both the empty case and the LLM-failure fallback. `items` mirrors the candidates one-to-one; the
 * summary is plain-language counts. No LLM, no network.
 */
export function buildDeterministicPlan(candidates: RestockCandidate[]): RestockPlan {
  if (candidates.length === 0) {
    return { weekly_summary: "Nothing to reorder this week.", items: [] };
  }

  const toOrder = candidates.filter((c) => c.state === "Understocked").length;
  const toMonitor = candidates.filter((c) => c.state === "Watch").length;

  const parts: string[] = [];
  if (toOrder > 0) parts.push(`${toOrder} product${toOrder === 1 ? "" : "s"} to reorder`);
  if (toMonitor > 0) parts.push(`${toMonitor} to monitor`);
  const weekly_summary = `Weekly restocking plan: ${parts.join(" and ")} — listed most urgent first.`;

  const items: RestockPlanItem[] = candidates.map((c) => ({
    product: c.product,
    action: c.action,
    reason: deterministicReason(c),
    daysOfStock: c.daysOfStock,
    leadTime: c.leadTime,
    units: c.units,
    state: c.state,
  }));
  return { weekly_summary, items };
}
