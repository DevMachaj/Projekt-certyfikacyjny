import { describe, expect, it } from "vitest";
import {
  classify,
  entryDays,
  recommendationText,
  THRESHOLD_DEFINITIONS,
  totalHistoryDays,
  velocityOf,
} from "@/lib/classification";
import type { ClassificationState, Product, SalesEntry } from "@/types";

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "p1",
    user_id: "u1",
    name: "Test product",
    stock_quantity: 10,
    lead_time_days: 5,
    buffer_days: 7,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

let entryCounter = 0;
function makeEntry(units: number, start: string, end: string): SalesEntry {
  entryCounter += 1;
  return {
    id: `e${entryCounter}`,
    product_id: "p1",
    user_id: "u1",
    units_sold: units,
    start_date: start,
    end_date: end,
    created_at: "2026-01-01T00:00:00Z",
  };
}

describe("day-count helpers", () => {
  it("counts a single-day entry as 1 inclusive day", () => {
    expect(entryDays(makeEntry(3, "2026-01-01", "2026-01-01"))).toBe(1);
  });

  it("counts a multi-day entry inclusively: (end − start) + 1", () => {
    expect(entryDays(makeEntry(3, "2026-01-01", "2026-01-05"))).toBe(5);
  });

  it("spans a 100-day range correctly across months (2026-01-01..2026-04-10)", () => {
    expect(entryDays(makeEntry(5, "2026-01-01", "2026-04-10"))).toBe(100);
  });

  it("totalHistoryDays is the calendar envelope incl. gap days, not the sum of spans", () => {
    // Jan 1–5 + Feb 1–4: the dead Jan 6 → Jan 31 gap counts as zero-sales history.
    // Envelope = max(end) − min(start) + 1 = Jan 1 → Feb 4 inclusive = 35 days (NOT 5 + 4).
    const entries = [makeEntry(3, "2026-01-01", "2026-01-05"), makeEntry(4, "2026-02-01", "2026-02-04")];
    expect(totalHistoryDays(entries)).toBe(35);
  });

  it("velocityOf is total units ÷ total days, and null with no history", () => {
    expect(velocityOf([makeEntry(10, "2026-01-01", "2026-01-05")])).toBe(2); // 10 / 5
    expect(velocityOf([])).toBeNull();
  });
});

describe("gap-day denominator (calendar envelope, OG-1)", () => {
  it("divides velocity by the full calendar envelope, counting dead gap days as zero-sales", () => {
    // PRD: velocity = total units ÷ total calendar days covered by all non-overlapping entries.
    // Jan 1–5 (10u) + Jan 20–24 (10u): envelope Jan 1 → Jan 24 inclusive = 24 days (NOT 5 + 5 = 10).
    const entries = [makeEntry(10, "2026-01-01", "2026-01-05"), makeEntry(10, "2026-01-20", "2026-01-24")];
    expect(totalHistoryDays(entries)).toBe(24);
    expect(velocityOf(entries)).toBeCloseTo(20 / 24); // ≈ 0.833/day, not 20 / 10 = 2/day
  });

  it("the 7-day Insufficient-data gate uses the envelope, so two short entries spanning ≥7 days classify", () => {
    // Jan 1–3 (3u) + Jan 8–10 (3u): envelope = Jan 1 → Jan 10 = 10 days (≥ 7), even though the
    // summed spans are only 3 + 3 = 6 days. Under the buggy sum this would be Insufficient data.
    const entries = [makeEntry(3, "2026-01-01", "2026-01-03"), makeEntry(3, "2026-01-08", "2026-01-10")];
    const result = classify(makeProduct({ stock_quantity: 25, lead_time_days: 10 }), entries);
    expect(result.totalDays).toBe(10);
    expect(result.state).not.toBe("Insufficient data");
  });
});

describe("Understocked beats Slow-mover (imminent stockout wins, OG-2)", () => {
  it("a low-velocity item that will stock out before lead time gets an Order, not promotion", () => {
    // 5 units / 100 days = 0.05/day (< 0.1, would otherwise be a Slow-mover); stock 1 →
    // days_of_stock = 1 / 0.05 = 20 < lead 30 → Understocked wins. PRD: reorder = ceil(v × (lead + buffer)).
    const result = classify(makeProduct({ stock_quantity: 1, lead_time_days: 30, buffer_days: 7 }), [
      makeEntry(5, "2026-01-01", "2026-04-10"), // 100-day envelope
    ]);
    expect(result.state).toBe("Understocked");
    // ceil(0.05 × (30 + 7)) = ceil(0.05 × 37) = ceil(1.85) = 2
    expect(result.recommendation).toEqual({ kind: "order", units: 2 });
  });

  it("zero-velocity with low stock stays Slow-mover (no finite runway → never Understocked)", () => {
    // 0 units / 10 days = 0/day → days_of_stock is null (∞), so the imminent-stockout test cannot fire.
    const result = classify(makeProduct({ stock_quantity: 1, lead_time_days: 30 }), [
      makeEntry(0, "2026-01-01", "2026-01-10"),
    ]);
    expect(result.state).toBe("Slow-mover");
    expect(result.daysOfStock).toBeNull();
    expect(result.recommendation).toEqual({ kind: "promote" });
  });
});

describe("Insufficient data (FR-008)", () => {
  it("returns Insufficient data below 7 days of history", () => {
    const result = classify(makeProduct(), [makeEntry(10, "2026-01-01", "2026-01-05")]); // 5 days
    expect(result.state).toBe("Insufficient data");
    expect(result.recommendation).toEqual({ kind: "none" });
    expect(result.velocity).toBe(2); // velocity still computed (10/5) but state is gated
    expect(result.daysOfStock).toBeNull();
  });

  it("clears once history reaches 7 days and routes to the correct state", () => {
    // Exactly 7 days (the boundary): 7u/7d = velocity 1; stock 25, lead 10 → days_of_stock 25,
    // which is the OK band [2×lead=20, 90). Pin the resulting state, not merely not-Insufficient,
    // so a regression that clears the gate but routes 7-day history into the wrong band fails.
    const result = classify(makeProduct({ stock_quantity: 25, lead_time_days: 10 }), [
      makeEntry(7, "2026-01-01", "2026-01-07"),
    ]);
    expect(result.state).not.toBe("Insufficient data");
    expect(result.state).toBe("OK");
    expect(result.velocity).toBe(1);
    expect(result.recommendation).toEqual({ kind: "none" });
  });

  it("handles zero entries without dividing by zero", () => {
    const result = classify(makeProduct(), []);
    expect(result.state).toBe("Insufficient data");
    expect(result.velocity).toBeNull();
    expect(result.daysOfStock).toBeNull();
    expect(result.totalDays).toBe(0);
    expect(result.totalUnits).toBe(0);
  });
});

describe("Slow-mover gate (precedence over day-bands)", () => {
  it("is Slow-mover when velocity < 0.1, even with days_of_stock < 90", () => {
    // 5 units / 100 days = 0.05/day; stock 1 → days_of_stock 20 (< 90)
    const result = classify(makeProduct({ stock_quantity: 1, lead_time_days: 5 }), [
      makeEntry(5, "2026-01-01", "2026-04-10"),
    ]);
    expect(result.state).toBe("Slow-mover");
    expect(result.recommendation).toEqual({ kind: "promote" });
  });

  it("is Slow-mover when days_of_stock >= 90 with velocity >= 0.1", () => {
    // 7 units / 7 days = 1/day; stock 90 → days_of_stock 90
    const result = classify(makeProduct({ stock_quantity: 90, lead_time_days: 5 }), [
      makeEntry(7, "2026-01-01", "2026-01-07"),
    ]);
    expect(result.state).toBe("Slow-mover");
    expect(result.velocity).toBe(1);
    expect(result.daysOfStock).toBe(90);
    expect(result.recommendation).toEqual({ kind: "promote" }); // high-stock Slow-mover still nudges promotion
  });

  it("velocity == 0.1 exactly is NOT a Slow-mover (rule is strict < 0.1)", () => {
    // 1 unit / 10 days = exactly 0.1/day. The gate is `velocity < 0.1`, so 0.1 must NOT be Slow.
    // stock 5 / 0.1 = 50 days of stock; lead 10 → OK band [2×lead=20, 90). Kills a `<`→`<=` mutant.
    const result = classify(makeProduct({ stock_quantity: 5, lead_time_days: 10 }), [
      makeEntry(1, "2026-01-01", "2026-01-10"),
    ]);
    expect(result.velocity).toBe(0.1);
    expect(result.state).not.toBe("Slow-mover");
    expect(result.state).toBe("OK");
  });

  it("velocity < 0.1 wins over an OK day-band (precedence case)", () => {
    // 5 units / 100 days = 0.05/day; lead 5 → 2×lead 10; stock 2 → days_of_stock 40 (OK band [10,90))
    const result = classify(makeProduct({ stock_quantity: 2, lead_time_days: 5 }), [
      makeEntry(5, "2026-01-01", "2026-04-10"),
    ]);
    expect(result.daysOfStock).toBeCloseTo(40);
    expect(result.state).toBe("Slow-mover"); // not OK
  });
});

describe("zero-sales periods (units_sold = 0)", () => {
  it("is a Slow-mover at velocity 0 with no divide-by-zero", () => {
    // 0 units / 10 days = 0/day; stock 10 — days_of_stock would be ∞, so it stays null
    const result = classify(makeProduct({ stock_quantity: 10, lead_time_days: 5 }), [
      makeEntry(0, "2026-01-01", "2026-01-10"),
    ]);
    expect(result.state).toBe("Slow-mover");
    expect(result.velocity).toBe(0);
    expect(result.daysOfStock).toBeNull();
    expect(result.recommendation).toEqual({ kind: "promote" });
  });

  it("lets a zero-sales period lower velocity rather than being dropped", () => {
    // 10 units over 5 active days + 0 over the next 15 days = 10 / 20 = 0.5/day
    // (vs 2/day if the dead period were omitted)
    const entries = [makeEntry(10, "2026-01-01", "2026-01-05"), makeEntry(0, "2026-01-06", "2026-01-20")];
    expect(velocityOf(entries)).toBe(0.5);
    const result = classify(makeProduct({ stock_quantity: 25, lead_time_days: 10 }), entries);
    expect(result.velocity).toBe(0.5);
    expect(result.daysOfStock).toBe(50); // 25 / 0.5
  });
});

describe("lead-time bands", () => {
  it("Understocked when days_of_stock < lead_time, with a specific reorder quantity", () => {
    // velocity 1 (7/7); lead 10; stock 5 → days_of_stock 5 < 10
    const result = classify(makeProduct({ stock_quantity: 5, lead_time_days: 10, buffer_days: 7 }), [
      makeEntry(7, "2026-01-01", "2026-01-07"),
    ]);
    expect(result.state).toBe("Understocked");
    // reorder = ceil(velocity × (lead + buffer)) = ceil(1 × 17) = 17
    expect(result.recommendation).toEqual({ kind: "order", units: 17 });
  });

  it("rounds a .5 reorder quantity up: ceil(8.5) = 9, never down (OG-3)", () => {
    // velocity 0.5 (10u/20d); lead 10 + buffer 7 = 17 → 0.5 × 17 = 8.5 exactly; stock 2 →
    // days_of_stock 4 < lead 10 → Understocked. ceil(8.5) = 9 (floor=8, round=8/9 — kills both).
    const result = classify(makeProduct({ stock_quantity: 2, lead_time_days: 10, buffer_days: 7 }), [
      makeEntry(10, "2026-01-01", "2026-01-20"), // 20-day envelope → velocity 0.5
    ]);
    expect(result.state).toBe("Understocked");
    expect(result.recommendation).toEqual({ kind: "order", units: 9 });
  });

  it("rounds the reorder quantity up (Math.ceil) for fractional velocity", () => {
    // velocity 10/7 ≈ 1.4286; lead 3, buffer 7; stock 1 → days_of_stock ≈ 0.7 < 3
    const result = classify(makeProduct({ stock_quantity: 1, lead_time_days: 3, buffer_days: 7 }), [
      makeEntry(10, "2026-01-01", "2026-01-07"),
    ]);
    expect(result.state).toBe("Understocked");
    // ceil(1.4286 × 10) = ceil(14.286) = 15
    expect(result.recommendation).toEqual({ kind: "order", units: 15 });
  });

  it("Watch at the lower boundary days_of_stock == lead_time", () => {
    // velocity 1; lead 10; stock 10 → days_of_stock 10 == lead → Watch (Understocked is < lead)
    const result = classify(makeProduct({ stock_quantity: 10, lead_time_days: 10 }), [
      makeEntry(7, "2026-01-01", "2026-01-07"),
    ]);
    expect(result.state).toBe("Watch");
    expect(result.recommendation).toEqual({ kind: "none" });
  });

  it("Watch within [lead, 2×lead) reports its velocity and days-of-stock", () => {
    // velocity 1; lead 10; stock 15 → days_of_stock 15 ∈ [10, 20)
    const result = classify(makeProduct({ stock_quantity: 15, lead_time_days: 10 }), [
      makeEntry(7, "2026-01-01", "2026-01-07"),
    ]);
    expect(result.state).toBe("Watch");
    expect(result.velocity).toBe(1); // transparency fields must survive on the Watch result (FR-006)
    expect(result.daysOfStock).toBe(15);
  });

  it("OK at the boundary days_of_stock == 2×lead_time", () => {
    // velocity 1; lead 10; stock 20 → days_of_stock 20 == 2×lead → OK (Watch is < 2×lead)
    const result = classify(makeProduct({ stock_quantity: 20, lead_time_days: 10 }), [
      makeEntry(7, "2026-01-01", "2026-01-07"),
    ]);
    expect(result.state).toBe("OK");
    expect(result.recommendation).toEqual({ kind: "none" });
  });

  it("OK within [2×lead, 90)", () => {
    // velocity 1; lead 10; stock 25 → days_of_stock 25 ∈ [20, 90)
    const result = classify(makeProduct({ stock_quantity: 25, lead_time_days: 10 }), [
      makeEntry(7, "2026-01-01", "2026-01-07"),
    ]);
    expect(result.state).toBe("OK");
  });
});

describe("null lead time (FR-007)", () => {
  it("is OK with a set-lead-time recommendation when not a Slow-mover", () => {
    // velocity 1 (≥ 0.1); stock 25 → days_of_stock 25 (< 90); lead null
    const result = classify(makeProduct({ stock_quantity: 25, lead_time_days: null }), [
      makeEntry(7, "2026-01-01", "2026-01-07"),
    ]);
    expect(result.state).toBe("OK");
    expect(result.recommendation).toEqual({ kind: "set-lead-time" });
  });

  it("is still Slow-mover when velocity < 0.1 even without a lead time", () => {
    // 5 units / 100 days = 0.05/day; lead null; stock 1 → days_of_stock 20
    const result = classify(makeProduct({ stock_quantity: 1, lead_time_days: null }), [
      makeEntry(5, "2026-01-01", "2026-04-10"),
    ]);
    expect(result.state).toBe("Slow-mover");
    expect(result.recommendation).toEqual({ kind: "promote" });
  });
});

describe("threshold labels", () => {
  it("sets thresholdLabel to the literal definition string of the assigned state", () => {
    // 7u/7d = velocity 1; stock 5 < lead 10 days of cover → Understocked. Assert the FR-006
    // transparency string as a literal (not a re-lookup of THRESHOLD_DEFINITIONS — that mirrors impl).
    const result = classify(makeProduct({ stock_quantity: 5, lead_time_days: 10 }), [
      makeEntry(7, "2026-01-01", "2026-01-07"),
    ]);
    expect(result.state).toBe("Understocked");
    expect(result.thresholdLabel).toBe("Fewer than lead-time days of stock remaining at current velocity.");
  });

  it("exposes a definition for every one of the five states", () => {
    expect(Object.keys(THRESHOLD_DEFINITIONS).sort()).toEqual(
      ["Insufficient data", "OK", "Slow-mover", "Understocked", "Watch"].sort(),
    );
  });
  // FR-006 transparency legend: each state's definition is shown verbatim in the UI. Pin every
  // string as a literal so a blanked/garbled definition (one assertion per state) fails.
  it.each<[ClassificationState, string]>([
    ["Insufficient data", "Fewer than 7 days of non-overlapping sales history."],
    ["Understocked", "Fewer than lead-time days of stock remaining at current velocity."],
    ["Watch", "Between lead-time and twice lead-time days of stock remaining."],
    ["OK", "Between twice lead-time and 90 days of stock remaining."],
    ["Slow-mover", "90 or more days of stock remaining, or selling fewer than 0.1 units/day."],
  ])("defines the %s threshold with its FR-006 transparency string", (state, definition) => {
    expect(THRESHOLD_DEFINITIONS[state]).toBe(definition);
  });
});

describe("recommendationText (user-facing action wording)", () => {
  it("words an order with its exact unit count", () => {
    expect(recommendationText({ kind: "order", units: 12 }, "Understocked")).toBe("Order 12 units");
  });

  it("words a promote nudge", () => {
    expect(recommendationText({ kind: "promote" }, "Slow-mover")).toBe("Consider promotion");
  });

  it("words a set-lead-time nudge", () => {
    expect(recommendationText({ kind: "set-lead-time" }, "OK")).toBe("Set lead time to get reorder suggestion");
  });

  it("words 'none' differently for Insufficient data vs a settled state", () => {
    // The state-dependent fork: Insufficient nudges logging more history; everything else is reassuring.
    expect(recommendationText({ kind: "none" }, "Insufficient data")).toBe(
      "Log at least 7 days of non-overlapping sales to get a classification.",
    );
    expect(recommendationText({ kind: "none" }, "OK")).toBe("No action needed right now.");
  });
});
