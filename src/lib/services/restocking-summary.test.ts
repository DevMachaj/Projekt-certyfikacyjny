import { describe, expect, it } from "vitest";
import { parseSummaryResponse } from "@/lib/services/restocking-summary";

/** A well-formed Anthropic Messages response whose text block carries the structured summary JSON. */
function makeResponse(text: string, stop_reason = "end_turn") {
  return { stop_reason, content: [{ type: "text", text }] };
}

describe("parseSummaryResponse", () => {
  it("extracts weekly_summary from a well-formed response", () => {
    const body = makeResponse(JSON.stringify({ weekly_summary: "Reorder 2 products this week." }));
    expect(parseSummaryResponse(body)).toEqual({ weekly_summary: "Reorder 2 products this week." });
  });

  it("returns null for a truncated / invalid-JSON text block (e.g. max_tokens)", () => {
    const body = makeResponse('{"weekly_summary": "Reorder 2 produc');
    expect(parseSummaryResponse(body)).toBeNull();
  });

  it("returns null when weekly_summary is missing", () => {
    const body = makeResponse(JSON.stringify({ summary: "wrong key" }));
    expect(parseSummaryResponse(body)).toBeNull();
  });

  it("returns null when weekly_summary is not a string", () => {
    const body = makeResponse(JSON.stringify({ weekly_summary: 42 }));
    expect(parseSummaryResponse(body)).toBeNull();
  });

  it("returns null for an empty or missing content array", () => {
    expect(parseSummaryResponse({ stop_reason: "end_turn", content: [] })).toBeNull();
    expect(parseSummaryResponse({ stop_reason: "end_turn" })).toBeNull();
  });

  it("returns null for non-text first block", () => {
    expect(parseSummaryResponse({ content: [{ type: "tool_use", input: {} }] })).toBeNull();
  });

  it("returns null for non-object input", () => {
    expect(parseSummaryResponse(null)).toBeNull();
    expect(parseSummaryResponse("nope")).toBeNull();
    expect(parseSummaryResponse(undefined)).toBeNull();
  });
});
