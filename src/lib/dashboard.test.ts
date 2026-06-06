import { describe, expect, it } from "vitest";
import type { ClassificationResult } from "@/lib/classification";
import { groupProductsByState, type ProductClassification } from "@/lib/dashboard";
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

function makeItem(name: string, state: ClassificationState): ProductClassification {
  const classification = {
    state,
    velocity: 1,
    daysOfStock: 10,
    totalDays: 30,
    totalUnits: 30,
    thresholdLabel: "",
    recommendation: { kind: "none" },
  } as ClassificationResult;
  return { product: makeProduct(name), classification };
}

describe("groupProductsByState", () => {
  it("returns groups in the fixed STATE_ORDER regardless of input order", () => {
    const items = [makeItem("a", "OK"), makeItem("b", "Understocked"), makeItem("c", "Slow-mover")];
    expect(groupProductsByState(items).map((g) => g.state)).toEqual(["Understocked", "OK", "Slow-mover"]);
  });

  it("omits states with zero items", () => {
    const items = [makeItem("a", "Watch"), makeItem("b", "Watch")];
    const groups = groupProductsByState(items);
    expect(groups).toHaveLength(1);
    expect(groups[0].state).toBe("Watch");
  });

  it("preserves input (alphabetical) order within a group", () => {
    const items = [makeItem("apple", "OK"), makeItem("banana", "OK"), makeItem("cherry", "OK")];
    expect(groupProductsByState(items)[0].items.map((i) => i.product.name)).toEqual(["apple", "banana", "cherry"]);
  });

  it("returns [] for all-empty input", () => {
    expect(groupProductsByState([])).toEqual([]);
  });

  it("returns all five groups in order when every state is populated", () => {
    const items = [
      makeItem("a", "Insufficient data"),
      makeItem("b", "OK"),
      makeItem("c", "Understocked"),
      makeItem("d", "Slow-mover"),
      makeItem("e", "Watch"),
    ];
    expect(groupProductsByState(items).map((g) => g.state)).toEqual([
      "Understocked",
      "Watch",
      "OK",
      "Slow-mover",
      "Insufficient data",
    ]);
  });
});
