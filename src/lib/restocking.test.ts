import { describe, expect, it } from "vitest";
import type { ClassificationResult, Recommendation } from "@/lib/classification";
import type { ProductClassification } from "@/lib/dashboard";
import { buildDeterministicPlan, deterministicReason, selectRestockCandidates } from "@/lib/restocking";
import type { ClassificationState, Product } from "@/types";

interface ItemOpts {
  recommendation?: Recommendation;
  daysOfStock?: number;
  leadTime?: number | null;
  velocity?: number;
}

function makeProduct(name: string, leadTime: number | null): Product {
  return {
    id: name,
    user_id: "u1",
    name,
    stock_quantity: 10,
    lead_time_days: leadTime,
    buffer_days: 7,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

function makeItem(name: string, state: ClassificationState, opts: ItemOpts = {}): ProductClassification {
  const { recommendation = { kind: "none" }, daysOfStock = 10, leadTime = 5, velocity = 1 } = opts;
  const classification: ClassificationResult = {
    state,
    velocity,
    daysOfStock,
    totalDays: 30,
    totalUnits: 30,
    thresholdLabel: "",
    recommendation,
  };
  return { product: makeProduct(name, leadTime), classification };
}

describe("selectRestockCandidates", () => {
  it("maps an Understocked product to numeric units, an 'Order N units' action, and leadTime", () => {
    const [candidate] = selectRestockCandidates([
      makeItem("widget", "Understocked", { recommendation: { kind: "order", units: 12 }, daysOfStock: 2, leadTime: 7 }),
    ]);
    expect(candidate.state).toBe("Understocked");
    expect(candidate.units).toBe(12);
    expect(candidate.action).toBe("Order 12 units");
    expect(candidate.leadTime).toBe(7);
  });

  it("maps a Watch product to 'Monitor' with no quantity ever", () => {
    const [candidate] = selectRestockCandidates([makeItem("gadget", "Watch")]);
    expect(candidate.state).toBe("Watch");
    expect(candidate.units).toBeNull();
    expect(candidate.action).toBe("Monitor");
    // The Watch action must never leak a quantity — defense against a future regression.
    expect(candidate.action).not.toMatch(/\d/);
  });

  it("excludes OK, Slow-mover, and Insufficient data", () => {
    const items = [
      makeItem("a", "OK"),
      makeItem("b", "Slow-mover", { recommendation: { kind: "promote" } }),
      makeItem("c", "Insufficient data"),
    ];
    expect(selectRestockCandidates(items)).toEqual([]);
  });

  it("orders by urgency (daysOfStock − leadTime), most urgent first, across states", () => {
    const items = [
      makeItem("w1", "Watch", { daysOfStock: 8, leadTime: 5 }), // urgency +3
      makeItem("u1", "Understocked", { recommendation: { kind: "order", units: 3 }, daysOfStock: 1, leadTime: 5 }), // -4
      makeItem("w2", "Watch", { daysOfStock: 9, leadTime: 5 }), // +4
      makeItem("u2", "Understocked", { recommendation: { kind: "order", units: 4 }, daysOfStock: 4, leadTime: 5 }), // -1
    ];
    expect(selectRestockCandidates(items).map((c) => c.product)).toEqual(["u1", "u2", "w1", "w2"]);
  });

  it("keeps input order for ties in urgency (stable sort)", () => {
    const items = [
      makeItem("b", "Understocked", { recommendation: { kind: "order", units: 1 }, daysOfStock: 2, leadTime: 5 }),
      makeItem("a", "Understocked", { recommendation: { kind: "order", units: 1 }, daysOfStock: 2, leadTime: 5 }),
    ];
    expect(selectRestockCandidates(items).map((c) => c.product)).toEqual(["b", "a"]);
  });

  it("returns [] for empty input", () => {
    expect(selectRestockCandidates([])).toEqual([]);
  });

  // Characterization guard for the null-facts branch of urgency() (`+Infinity` → "sort last").
  // The engine never emits Understocked/Watch with a null leadTime today, so this branch is
  // currently unreachable in production — but the guard is a deliberate constraint (see
  // context/archive/2026-06-17-restocking-plan-decision-support/plan.md:16,48). This pins
  // "missing facts sort last" so a future change to classify() cannot silently break ordering.
  // Input order puts the null-facts candidate FIRST on purpose: a broken guard would leave it there.
  it("sorts a candidate with missing facts (null leadTime → +Infinity) last, regardless of state", () => {
    const items = [
      makeItem("nullfacts", "Watch", { leadTime: null }), // urgency +Infinity → must sort last
      makeItem("hasfacts", "Watch", { daysOfStock: 8, leadTime: 5 }), // urgency +3
    ];
    expect(selectRestockCandidates(items).map((c) => c.product)).toEqual(["hasfacts", "nullfacts"]);
  });
});

describe("deterministicReason", () => {
  it("states the runway vs lead time for Understocked and says to order now", () => {
    const [c] = selectRestockCandidates([
      makeItem("widget", "Understocked", { recommendation: { kind: "order", units: 12 }, daysOfStock: 2, leadTime: 7 }),
    ]);
    const reason = deterministicReason(c);
    expect(reason).toContain("2 days of stock");
    expect(reason).toContain("7-day lead time");
    expect(reason.toLowerCase()).toContain("order now");
  });

  it("explains a Watch product without ever stating an order quantity", () => {
    const [c] = selectRestockCandidates([makeItem("gadget", "Watch", { daysOfStock: 9, leadTime: 5 })]);
    const reason = deterministicReason(c);
    expect(reason).toContain("9 days of stock");
    expect(reason.toLowerCase()).toContain("reorder soon");
    expect(reason).not.toMatch(/order \d/i);
    expect(reason.toLowerCase()).not.toContain("units");
  });
});

describe("buildDeterministicPlan", () => {
  it("returns the empty-case summary and no items for []", () => {
    expect(buildDeterministicPlan([])).toEqual({ headline: "Nothing to reorder this week.", items: [] });
  });

  it("enriches each candidate into an item with action, deterministic reason, and facts", () => {
    const candidates = selectRestockCandidates([
      makeItem("widget", "Understocked", { recommendation: { kind: "order", units: 12 }, daysOfStock: 2, leadTime: 7 }),
      makeItem("gadget", "Watch", { daysOfStock: 9, leadTime: 5 }),
    ]);
    const plan = buildDeterministicPlan(candidates);

    expect(plan.items).toHaveLength(2);
    expect(plan.items[0]).toMatchObject({
      product: "widget",
      action: "Order 12 units",
      daysOfStock: 2,
      leadTime: 7,
      units: 12,
      state: "Understocked",
    });
    expect(plan.items[0].reason).toContain("2 days of stock");
    expect(plan.items[1]).toMatchObject({ product: "gadget", action: "Monitor", units: null, state: "Watch" });
    expect(plan.headline).toContain("1 product to reorder");
    expect(plan.headline).toContain("1 to monitor");
  });
});
