import { describe, expect, it } from "vitest";
import { mergeAiReasons, parsePlanResponse } from "@/lib/services/restocking-summary";
import type { RestockPlan, RestockPlanItem } from "@/lib/restocking";

/** A well-formed Anthropic Messages response whose text block carries the structured plan JSON. */
function makeResponse(text: string, stop_reason = "end_turn") {
  return { stop_reason, content: [{ type: "text", text }] };
}

function item(product: string, reason: string): RestockPlanItem {
  return { product, action: "Order 5 units", reason, daysOfStock: 2, leadTime: 5, units: 5, state: "Understocked" };
}

describe("parsePlanResponse", () => {
  it("extracts headline and items from a well-formed response", () => {
    const body = makeResponse(
      JSON.stringify({ headline: "Two to reorder this week.", items: [{ product: "Widget", reason: "Low runway." }] }),
    );
    expect(parsePlanResponse(body)).toEqual({
      headline: "Two to reorder this week.",
      items: [{ product: "Widget", reason: "Low runway." }],
    });
  });

  it("returns null when headline is missing or not a string", () => {
    expect(parsePlanResponse(makeResponse(JSON.stringify({ items: [] })))).toBeNull();
    expect(parsePlanResponse(makeResponse(JSON.stringify({ headline: 7, items: [] })))).toBeNull();
  });

  it("returns null when items is not an array", () => {
    expect(parsePlanResponse(makeResponse(JSON.stringify({ headline: "h", items: "nope" })))).toBeNull();
  });

  it("returns null when an item is missing product or reason", () => {
    expect(parsePlanResponse(makeResponse(JSON.stringify({ headline: "h", items: [{ product: "W" }] })))).toBeNull();
    expect(parsePlanResponse(makeResponse(JSON.stringify({ headline: "h", items: [{ reason: "r" }] })))).toBeNull();
  });

  it("returns null for truncated / invalid JSON (e.g. max_tokens)", () => {
    expect(parsePlanResponse(makeResponse('{"headline": "Two to re'))).toBeNull();
  });

  it("returns null for empty/missing content or a non-text first block", () => {
    expect(parsePlanResponse({ stop_reason: "end_turn", content: [] })).toBeNull();
    expect(parsePlanResponse({ content: [{ type: "tool_use", input: {} }] })).toBeNull();
    expect(parsePlanResponse(null)).toBeNull();
  });
});

describe("mergeAiReasons", () => {
  const plan: RestockPlan = {
    headline: "Engine summary.",
    items: [item("Widget", "deterministic widget reason"), item("Gadget", "deterministic gadget reason")],
  };

  it("replaces the headline and overlays AI reasons by product name", () => {
    const merged = mergeAiReasons(plan, {
      headline: "AI headline.",
      items: [
        { product: "Widget", reason: "AI widget reason" },
        { product: "Gadget", reason: "AI gadget reason" },
      ],
    });
    expect(merged.headline).toBe("AI headline.");
    expect(merged.items.map((i) => i.reason)).toEqual(["AI widget reason", "AI gadget reason"]);
  });

  it("drops a hallucinated product and keeps item count, order, actions, and units", () => {
    const merged = mergeAiReasons(plan, {
      headline: "AI headline.",
      items: [
        { product: "Ghost", reason: "invented" },
        { product: "Gadget", reason: "AI gadget reason" },
      ],
    });
    expect(merged.items.map((i) => i.product)).toEqual(["Widget", "Gadget"]);
    expect(merged.items[0].reason).toBe("deterministic widget reason"); // no AI reason → deterministic kept
    expect(merged.items[1].reason).toBe("AI gadget reason");
    expect(merged.items.map((i) => i.action)).toEqual(["Order 5 units", "Order 5 units"]);
    expect(merged.items.map((i) => i.units)).toEqual([5, 5]);
  });

  it("keeps the deterministic reason when the AI omits an item", () => {
    const merged = mergeAiReasons(plan, { headline: "AI headline.", items: [] });
    expect(merged.items.map((i) => i.reason)).toEqual(["deterministic widget reason", "deterministic gadget reason"]);
  });
});
