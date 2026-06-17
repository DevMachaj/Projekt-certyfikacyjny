import { describe, expect, it } from "vitest";
import type { ClassificationResult, Recommendation } from "@/lib/classification";
import type { ProductClassification } from "@/lib/dashboard";
import { buildDeterministicPlan, selectRestockCandidates } from "@/lib/restocking";
import type { ClassificationState, Product } from "@/types";

function makeProduct(name: string): Product {
  return {
    id: name,
    user_id: "u1",
    name,
    stock_quantity: 10,
    lead_time_days: 5,
    buffer_days: 7,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

function makeItem(
  name: string,
  state: ClassificationState,
  recommendation: Recommendation = { kind: "none" },
  extra: Partial<ClassificationResult> = {},
): ProductClassification {
  const classification: ClassificationResult = {
    state,
    velocity: 1,
    daysOfStock: 10,
    totalDays: 30,
    totalUnits: 30,
    thresholdLabel: "",
    recommendation,
    ...extra,
  };
  return { product: makeProduct(name), classification };
}

describe("selectRestockCandidates", () => {
  it("maps an Understocked product to numeric units and an 'Order N units' action", () => {
    const [candidate] = selectRestockCandidates([makeItem("widget", "Understocked", { kind: "order", units: 12 })]);
    expect(candidate.state).toBe("Understocked");
    expect(candidate.units).toBe(12);
    expect(candidate.action).toBe("Order 12 units");
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
      makeItem("b", "Slow-mover", { kind: "promote" }),
      makeItem("c", "Insufficient data"),
    ];
    expect(selectRestockCandidates(items)).toEqual([]);
  });

  it("orders all Understocked before all Watch, preserving input order within each", () => {
    const items = [
      makeItem("w1", "Watch"),
      makeItem("u1", "Understocked", { kind: "order", units: 3 }),
      makeItem("w2", "Watch"),
      makeItem("u2", "Understocked", { kind: "order", units: 4 }),
    ];
    expect(selectRestockCandidates(items).map((c) => c.product)).toEqual(["u1", "u2", "w1", "w2"]);
  });

  it("returns [] for empty input", () => {
    expect(selectRestockCandidates([])).toEqual([]);
  });
});

describe("buildDeterministicPlan", () => {
  it("returns the empty-case summary and no items for []", () => {
    expect(buildDeterministicPlan([])).toEqual({ weekly_summary: "Nothing to reorder this week.", items: [] });
  });

  it("mirrors each candidate's product and action into items", () => {
    const candidates = selectRestockCandidates([
      makeItem("widget", "Understocked", { kind: "order", units: 12 }),
      makeItem("gadget", "Watch"),
    ]);
    const plan = buildDeterministicPlan(candidates);
    expect(plan.items).toEqual([
      { product: "widget", action: "Order 12 units" },
      { product: "gadget", action: "Monitor" },
    ]);
    expect(plan.weekly_summary).toContain("1 product to reorder");
    expect(plan.weekly_summary).toContain("1 to monitor");
  });
});
