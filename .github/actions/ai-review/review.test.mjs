import { describe, expect, it } from "vitest";
import {
  computeVerdict,
  isBlocking,
  parseReviewResponse,
  renderComment,
  renderSummary,
  truncateDiff,
} from "./review.mjs";

/**
 * Every expected value below is a literal drawn from the plan's verdict contract or from the
 * fixture defined in this file — never recomputed with the function under test. The mirror
 * anti-pattern (`expect(truncateDiff(d, n).diff).toBe(d.slice(0, boundary(d)))`) re-derives the
 * answer the same way the implementation does, so it would pass against a bug.
 */

function finding(overrides = {}) {
  return {
    dimension: "correctness_reliability",
    severity: "warning",
    confidence: "high",
    title: "Something",
    location: "src/a.ts:1",
    detail: "detail",
    fix: "fix",
    criterion: "#1",
    ...overrides,
  };
}

describe("computeVerdict", () => {
  it("passes on an empty finding list", () => {
    expect(computeVerdict([])).toBe("pass");
  });

  it("fails on a critical + medium-confidence finding in a blocking dimension", () => {
    const findings = [finding({ severity: "critical", confidence: "medium", dimension: "correctness_reliability" })];
    expect(computeVerdict(findings)).toBe("fail");
  });

  it("fails on a critical + high-confidence finding in security_isolation", () => {
    const findings = [finding({ severity: "critical", confidence: "high", dimension: "security_isolation" })];
    expect(computeVerdict(findings)).toBe("fail");
  });

  it("passes a critical finding whose confidence is low", () => {
    const findings = [finding({ severity: "critical", confidence: "low", dimension: "security_isolation" })];
    expect(computeVerdict(findings)).toBe("pass");
  });

  it("passes a critical + high-confidence finding in a non-blocking dimension", () => {
    const findings = [finding({ severity: "critical", confidence: "high", dimension: "conventions_architecture" })];
    expect(computeVerdict(findings)).toBe("pass");
  });

  it("passes when the worst finding is a warning in a blocking dimension", () => {
    const findings = [finding({ severity: "warning", confidence: "high", dimension: "correctness_reliability" })];
    expect(computeVerdict(findings)).toBe("pass");
  });

  it("fails when any one finding blocks, even among passing ones", () => {
    const findings = [
      finding({ severity: "observation", confidence: "high" }),
      finding({ severity: "critical", confidence: "high", dimension: "security_isolation" }),
      finding({ severity: "warning", confidence: "low" }),
    ];
    expect(computeVerdict(findings)).toBe("fail");
  });
});

describe("isBlocking", () => {
  it("is true only for a non-low-confidence critical in a gating dimension", () => {
    expect(isBlocking(finding({ severity: "critical", confidence: "high", dimension: "security_isolation" }))).toBe(
      true,
    );
    expect(isBlocking(finding({ severity: "critical", confidence: "low", dimension: "security_isolation" }))).toBe(
      false,
    );
    expect(isBlocking(finding({ severity: "warning", confidence: "high", dimension: "security_isolation" }))).toBe(
      false,
    );
    expect(isBlocking(finding({ severity: "critical", confidence: "high", dimension: "testing" }))).toBe(false);
  });
});

const FILE_A = `diff --git a/a.ts b/a.ts
index 1111111..2222222 100644
--- a/a.ts
+++ b/a.ts
@@ -1 +1 @@
-const a = 1;
+const a = 2;
`;

const FILE_B = `diff --git a/b.ts b/b.ts
index 3333333..4444444 100644
--- a/b.ts
+++ b/b.ts
@@ -1 +1 @@
-const b = 1;
+const b = 2;
`;

describe("truncateDiff", () => {
  it("returns a under-cap diff byte-identical and untruncated", () => {
    const result = truncateDiff(FILE_A, 1_000_000);
    expect(result.diff).toBe(FILE_A);
    expect(result.truncated).toBe(false);
    expect(result.droppedFiles).toBe(0);
  });

  it("cuts exactly on the `diff --git` boundary, never mid-hunk", () => {
    const both = FILE_A + FILE_B;
    // Cap chosen so file A fits exactly and file B cannot.
    const result = truncateDiff(both, Buffer.byteLength(FILE_A, "utf8"));
    expect(result.diff).toBe(FILE_A);
    expect(result.truncated).toBe(true);
    expect(result.droppedFiles).toBe(1);
  });

  it("keeps a non-empty prefix when a single file already exceeds the cap", () => {
    const result = truncateDiff(FILE_A + FILE_B, 10);
    expect(result.diff).toBe("diff --git");
    expect(result.truncated).toBe(true);
    expect(result.droppedFiles).toBe(1);
  });

  it("byte-caps input that has no `diff --git` boundary at all", () => {
    const result = truncateDiff("a.ts\nb.ts\nc.ts\n", 4);
    expect(result.diff).toBe("a.ts");
    expect(result.truncated).toBe(true);
    expect(result.droppedFiles).toBe(0);
  });

  it("does not split a multi-byte character when byte-capping", () => {
    // "é" is two bytes; a cap of 2 must drop it rather than emit half of it.
    const result = truncateDiff("aé", 2);
    expect(result.diff).toBe("a");
  });
});

const VALID_REVIEW = {
  summary: "Small, focused change.",
  scorecard: [{ dimension: "testing", verdict: "pass", note: "No new business logic." }],
  findings: [],
  top_actions: ["Ship it."],
};

function response(text, content) {
  return { stop_reason: "end_turn", content: content ?? [{ type: "text", text }] };
}

describe("parseReviewResponse", () => {
  it("parses a well-formed response", () => {
    const parsed = parseReviewResponse(response(JSON.stringify(VALID_REVIEW)));
    expect(parsed.summary).toBe("Small, focused change.");
    expect(parsed.findings).toEqual([]);
    expect(parsed.topActions).toEqual(["Ship it."]);
  });

  it("finds the text block when a thinking block comes first", () => {
    // Thinking is on by default on this model generation, so the JSON is rarely content[0].
    const body = response(null, [
      { type: "thinking", thinking: "" },
      { type: "text", text: JSON.stringify(VALID_REVIEW) },
    ]);
    expect(parseReviewResponse(body).summary).toBe("Small, focused change.");
  });

  it("returns null when no block carries text", () => {
    expect(parseReviewResponse(response(null, [{ type: "thinking", thinking: "" }]))).toBe(null);
  });

  it("returns null on empty content", () => {
    expect(parseReviewResponse({ stop_reason: "end_turn", content: [] })).toBe(null);
  });

  it("returns null on a non-object body", () => {
    expect(parseReviewResponse(null)).toBe(null);
    expect(parseReviewResponse("nope")).toBe(null);
  });

  it("returns null on non-JSON text", () => {
    expect(parseReviewResponse(response("I'm afraid I can't do that."))).toBe(null);
  });

  it("returns null when `findings` is missing", () => {
    const { findings: _dropped, ...withoutFindings } = VALID_REVIEW;
    expect(parseReviewResponse(response(JSON.stringify(withoutFindings)))).toBe(null);
  });

  it("returns null when a finding has a non-string title", () => {
    const bad = { ...VALID_REVIEW, findings: [{ ...finding(), title: 42 }] };
    expect(parseReviewResponse(response(JSON.stringify(bad)))).toBe(null);
  });

  it("returns null on an unknown dimension", () => {
    const bad = { ...VALID_REVIEW, findings: [finding({ dimension: "plan_adherence" })] };
    expect(parseReviewResponse(response(JSON.stringify(bad)))).toBe(null);
  });

  it("returns null on an unknown severity", () => {
    const bad = { ...VALID_REVIEW, findings: [finding({ severity: "blocker" })] };
    expect(parseReviewResponse(response(JSON.stringify(bad)))).toBe(null);
  });

  it("sorts findings critical-first and caps the list at 10", () => {
    const many = [
      finding({ severity: "observation", title: "obs" }),
      finding({ severity: "critical", confidence: "medium", title: "crit-medium" }),
      finding({ severity: "warning", title: "warn" }),
      finding({ severity: "critical", confidence: "high", title: "crit-high" }),
      ...Array.from({ length: 9 }, (_, i) => finding({ severity: "observation", title: `filler-${i}` })),
    ];
    const parsed = parseReviewResponse(response(JSON.stringify({ ...VALID_REVIEW, findings: many })));
    expect(parsed.findings).toHaveLength(10);
    expect(parsed.findings.map((f) => f.title).slice(0, 4)).toEqual(["crit-high", "crit-medium", "warn", "obs"]);
  });

  it("caps top actions at 3", () => {
    const body = { ...VALID_REVIEW, top_actions: ["a", "b", "c", "d"] };
    expect(parseReviewResponse(response(JSON.stringify(body))).topActions).toEqual(["a", "b", "c"]);
  });
});

describe("renderComment", () => {
  it("renders the no-findings path rather than an empty table", () => {
    const review = { summary: "Clean.", scorecard: [], findings: [], topActions: [] };
    const md = renderComment(review, { verdict: "pass", baseRef: "main" });
    expect(md).toContain("No findings.");
    expect(md).not.toContain("### F1");
  });

  it("renders each finding with its severity, location and DoD criterion", () => {
    const review = {
      summary: "One problem.",
      scorecard: [],
      findings: [finding({ severity: "critical", title: "Unguarded db call", location: "src/pages/api/x.ts:12" })],
      topActions: [],
    };
    const md = renderComment(review, { verdict: "fail", baseRef: "main" });
    expect(md).toContain("### F1 — Unguarded db call");
    expect(md).toContain("src/pages/api/x.ts:12");
    expect(md).toContain("#1");
  });

  it("renders the review-unavailable path when there is no review", () => {
    const md = renderComment(null, { verdict: "error", reason: "http_error" });
    expect(md).toContain("Review unavailable");
    expect(md).toContain("http_error");
  });
});

describe("renderSummary", () => {
  it("carries the debug table that does not belong in a PR comment", () => {
    const md = renderSummary(null, {
      verdict: "error",
      reason: "refusal",
      model: "claude-opus-5",
      effort: "medium",
      usage: { input_tokens: 5000, output_tokens: 900 },
    });
    expect(md).toContain("### Debug");
    expect(md).toContain("claude-opus-5");
    expect(md).toContain("5000");
    expect(md).toContain("refusal");
  });
});
