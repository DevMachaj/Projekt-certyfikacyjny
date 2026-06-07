import { describe, expect, it } from "vitest";
import type { ClassificationResult } from "@/lib/classification";
import { classifyUserCatalog, groupProductsByState, type ProductClassification } from "@/lib/dashboard";
import type { ClassificationState, Product, SalesEntry } from "@/types";

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

function makeEntry(productId: string, units: number, start: string, end: string): SalesEntry {
  return {
    id: `${productId}-${start}`,
    product_id: productId,
    user_id: "u1",
    units_sold: units,
    start_date: start,
    end_date: end,
    created_at: "2026-01-01T00:00:00Z",
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

describe("classifyUserCatalog", () => {
  it("pairs each product with its classify result, in input order", () => {
    const products = [makeProduct("alpha"), makeProduct("beta")];
    const result = classifyUserCatalog(products, []);
    expect(result.map((r) => r.product.name)).toEqual(["alpha", "beta"]);
    // No entries → not enough history → Insufficient data for every product.
    expect(result.map((r) => r.classification.state)).toEqual(["Insufficient data", "Insufficient data"]);
  });

  it("matches entries to the right product by product_id (no cross-leak)", () => {
    const withHistory = makeProduct("with-history");
    const noHistory = makeProduct("no-history");
    // 30 units across 30 inclusive days → velocity 1/day, well over the 7-day minimum.
    const entries = [
      makeEntry(withHistory.id, 30, "2026-01-01", "2026-01-30"),
      // An unrelated product's entries must not count toward either product above.
      makeEntry("unrelated", 99, "2026-01-01", "2026-01-30"),
    ];

    const result = classifyUserCatalog([withHistory, noHistory], entries);

    // The product with matching history gets a real (non-Insufficient) classification...
    expect(result[0].classification.state).not.toBe("Insufficient data");
    expect(result[0].classification.velocity).toBe(1);
    // ...while the product with no matching entries stays Insufficient data — entries did not leak.
    expect(result[1].classification.state).toBe("Insufficient data");
  });
});
