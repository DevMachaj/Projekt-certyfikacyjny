import type { ClassificationState, Product, SalesEntry } from "@/types";

/**
 * Velocity classification engine — the product's core IP.
 *
 * Pure and dependency-free (imports types only): turns a product + its sales entries
 * into a classification state, the threshold definition text, and a recommended action.
 * Computed server-side only; the API returns the result and the detail page renders it.
 *
 * Rules mirror the PRD Business Logic (formulas + threshold table) and the resolved oracle:
 *   - Inclusive day-count: an entry covers (end − start) + 1 calendar days; total history is the
 *     calendar envelope max(end) − min(start) + 1, so gap days between entries count as zero-sales.
 *   - Evaluation order: Insufficient → Understocked → Slow-mover → Watch → OK.
 *   - Understocked (imminent stockout) wins over the velocity < 0.1 Slow-mover gate; zero-velocity
 *     has no finite runway, so it can never be Understocked and stays Slow-mover.
 *   - When lead_time_days is null: lead-independent states only (Slow-mover or OK + set-lead-time).
 *   - Reorder quantity = ceil(velocity × (lead_time + buffer)), Understocked + lead set only.
 */

/** Minimum days of non-overlapping history before a real classification is produced (FR-008). */
export const MIN_HISTORY_DAYS = 7;
/** A product selling fewer than this many units/day is a Slow-mover regardless of stock. */
export const SLOW_VELOCITY = 0.1;
/** Stock cover (in days) at or above which a product is a Slow-mover. */
export const SLOW_DAYS_OF_STOCK = 90;

const MS_PER_DAY = 86_400_000;

export type Recommendation =
  | { kind: "order"; units: number }
  | { kind: "promote" }
  | { kind: "set-lead-time" }
  | { kind: "none" };

export interface ClassificationResult {
  state: ClassificationState;
  /** units/day over all history; null when there is no history. */
  velocity: number | null;
  /** stock_quantity ÷ velocity; null when velocity is unavailable. */
  daysOfStock: number | null;
  /** Calendar envelope in days across all entries: max(end) − min(start) + 1 (gap days included). */
  totalDays: number;
  totalUnits: number;
  /** Human-readable definition of the assigned state (= THRESHOLD_DEFINITIONS[state]). */
  thresholdLabel: string;
  recommendation: Recommendation;
}

/**
 * The full threshold ladder for every state, surfaced so the UI can render the complete
 * transparency legend FR-006 calls for ("display the threshold definition for each state").
 */
export const THRESHOLD_DEFINITIONS: Record<ClassificationState, string> = {
  "Insufficient data": "Fewer than 7 days of non-overlapping sales history.",
  Understocked: "Fewer than lead-time days of stock remaining at current velocity.",
  Watch: "Between lead-time and twice lead-time days of stock remaining.",
  OK: "Between twice lead-time and 90 days of stock remaining.",
  "Slow-mover": "90 or more days of stock remaining, or selling fewer than 0.1 units/day.",
};

/**
 * Fixed display order for classification states (FR-009 dashboard group order). Canonical here
 * so every view — the detail panel and the dashboard — shares one source and cannot drift.
 */
export const STATE_ORDER: ClassificationState[] = ["Understocked", "Watch", "OK", "Slow-mover", "Insufficient data"];

/**
 * Plain-text recommended action for a classification result — the single source of the wording
 * shown on both the detail panel and the dashboard card. Presentation (icons) stays in the view;
 * the words live here so they cannot fork.
 */
export function recommendationText(rec: Recommendation, state: ClassificationState): string {
  switch (rec.kind) {
    case "order":
      return `Order ${rec.units} units`;
    case "promote":
      return "Consider promotion";
    case "set-lead-time":
      return "Set lead time to get reorder suggestion";
    case "none":
      return state === "Insufficient data"
        ? "Log at least 7 days of non-overlapping sales to get a classification."
        : "No action needed right now.";
  }
}

/** Parse a `YYYY-MM-DD` date string to a UTC epoch (ms), avoiding local-timezone off-by-one. */
function parseUTC(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

/** Inclusive calendar days covered by a single entry: (end − start) + 1. A one-day entry = 1. */
export function entryDays(entry: SalesEntry): number {
  return (parseUTC(entry.end_date) - parseUTC(entry.start_date)) / MS_PER_DAY + 1;
}

/**
 * Total history in days — the calendar envelope `max(end) − min(start) + 1` across all entries.
 * Gap days between non-adjacent entries count as zero-sales history (PRD: "total calendar days
 * covered by all non-overlapping entries"). Empty → 0; a single entry → its inclusive span.
 */
export function totalHistoryDays(entries: SalesEntry[]): number {
  if (entries.length === 0) return 0;
  let minStart = Infinity;
  let maxEnd = -Infinity;
  for (const entry of entries) {
    minStart = Math.min(minStart, parseUTC(entry.start_date));
    maxEnd = Math.max(maxEnd, parseUTC(entry.end_date));
  }
  return (maxEnd - minStart) / MS_PER_DAY + 1;
}

/** Velocity in units/day over all history; null when there is no history (avoids ÷0). */
export function velocityOf(entries: SalesEntry[]): number | null {
  const days = totalHistoryDays(entries);
  if (days <= 0) return null;
  const units = entries.reduce((sum, entry) => sum + entry.units_sold, 0);
  return units / days;
}

export function classify(product: Product, entries: SalesEntry[]): ClassificationResult {
  const totalDays = totalHistoryDays(entries);
  const totalUnits = entries.reduce((sum, entry) => sum + entry.units_sold, 0);

  const base = (state: ClassificationState, fields: Partial<ClassificationResult>): ClassificationResult => ({
    state,
    velocity: null,
    daysOfStock: null,
    totalDays,
    totalUnits,
    thresholdLabel: THRESHOLD_DEFINITIONS[state],
    recommendation: { kind: "none" },
    ...fields,
  });

  // (1) Honest uncertainty: too little history to classify (FR-008).
  if (totalDays < MIN_HISTORY_DAYS) {
    return base("Insufficient data", { velocity: totalDays > 0 ? totalUnits / totalDays : null });
  }

  // velocity ≥ 0 here (totalDays ≥ 7 implies ≥ 1 entry); units_sold ≥ 0 means a product
  // logged over a period with no sales has velocity 0 — and therefore no finite stock runway.
  const velocity = totalUnits / totalDays;
  // Finite days-of-stock only when the product is actually selling; zero-velocity → no runway (null).
  const daysOfStock = velocity > 0 ? product.stock_quantity / velocity : null;
  const leadTime = product.lead_time_days;

  // (2) Imminent stockout wins over every velocity/day-band signal (OG-2): a barely-selling item
  //     that will still run out before its lead time must be reordered, not promoted. Requires a
  //     lead time and a finite runway — zero-velocity (daysOfStock null) can never reach here.
  if (leadTime != null && daysOfStock != null && daysOfStock < leadTime) {
    const units = Math.ceil(velocity * (leadTime + product.buffer_days));
    return base("Understocked", { velocity, daysOfStock, recommendation: { kind: "order", units } });
  }

  // (3) Slow-mover: barely selling (incl. zero-velocity), or sitting on 90+ days of cover. Checked
  //     after Understocked so a low-velocity-but-stocking-out item is not mislabelled.
  if (velocity < SLOW_VELOCITY) {
    return base("Slow-mover", { velocity, daysOfStock, recommendation: { kind: "promote" } });
  }
  if (daysOfStock != null && daysOfStock >= SLOW_DAYS_OF_STOCK) {
    return base("Slow-mover", { velocity, daysOfStock, recommendation: { kind: "promote" } });
  }

  // (4) No lead time → lead-independent states only: nudge the owner to set it (FR-007).
  if (leadTime == null) {
    return base("OK", { velocity, daysOfStock, recommendation: { kind: "set-lead-time" } });
  }

  // (5) Lead-time bands. velocity ≥ 0.1 here, so daysOfStock is finite; daysOfStock ≥ leadTime
  //     (else it would be Understocked above), so Watch is the [lead, 2×lead) band.
  if (daysOfStock != null && daysOfStock < 2 * leadTime) {
    return base("Watch", { velocity, daysOfStock });
  }
  return base("OK", { velocity, daysOfStock });
}
