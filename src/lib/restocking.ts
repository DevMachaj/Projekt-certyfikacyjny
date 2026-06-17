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
  velocity: number | null;
}

export interface RestockPlanItem {
  product: string;
  action: string;
}

export interface RestockPlan {
  weekly_summary: string;
  items: RestockPlanItem[];
}

/** The two restock-relevant states, in display precedence: Understocked before Watch (per STATE_ORDER). */
const RESTOCK_STATES = ["Understocked", "Watch"] as const;

/**
 * Select the products that belong in the weekly restocking plan and fix each one's action
 * deterministically. Keeps only `Understocked` and `Watch`, with all Understocked (in input order)
 * before all Watch (in input order) — matching the dashboard's STATE_ORDER precedence.
 *
 * The action wording is engine-derived, never LLM-derived: `Understocked` reuses the shared
 * `recommendationText` (→ "Order N units") so it cannot fork from the dashboard/detail views;
 * `Watch` is a literal "Monitor" and never carries a quantity.
 */
export function selectRestockCandidates(items: ProductClassification[]): RestockCandidate[] {
  const candidates: RestockCandidate[] = [];
  for (const state of RESTOCK_STATES) {
    for (const { product, classification } of items) {
      if (classification.state !== state) continue;
      const units = classification.recommendation.kind === "order" ? classification.recommendation.units : null;
      const action =
        state === "Understocked" ? recommendationText(classification.recommendation, classification.state) : "Monitor";
      candidates.push({
        product: product.name,
        state,
        units,
        action,
        daysOfStock: classification.daysOfStock,
        velocity: classification.velocity,
      });
    }
  }
  return candidates;
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
  const weekly_summary = `Weekly restocking plan: ${parts.join(" and ")}.`;

  const items = candidates.map((c) => ({ product: c.product, action: c.action }));
  return { weekly_summary, items };
}
