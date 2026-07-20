import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { productRowSchema, salesEntryRowSchema } from "@/lib/validation/rows";
import type { Product, SalesEntry } from "@/types";

const sampleProduct: Product = {
  id: "p1",
  user_id: "u1",
  name: "Widget",
  stock_quantity: 10,
  lead_time_days: 5,
  buffer_days: 7,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const sampleSalesEntry: SalesEntry = {
  id: "s1",
  product_id: "p1",
  user_id: "u1",
  units_sold: 3,
  start_date: "2026-01-01",
  end_date: "2026-01-07",
  created_at: "2026-01-01T00:00:00Z",
};

describe("row schemas stay in sync with src/types.ts", () => {
  // Bidirectional assignability = fails `npm run typecheck` if either schema drifts from its
  // hand-written type (missing/extra field or wrong field type), in either direction. The
  // assignments below are the actual drift guard; `expect` just keeps the consts used at runtime.
  it("productRowSchema infers exactly Product", () => {
    const parsed = productRowSchema.parse(sampleProduct);
    const inferToType: Product = parsed;
    const typeToInfer: z.infer<typeof productRowSchema> = sampleProduct;
    expect(inferToType).toEqual(sampleProduct);
    expect(typeToInfer).toEqual(sampleProduct);
  });

  it("salesEntryRowSchema infers exactly SalesEntry", () => {
    const parsed = salesEntryRowSchema.parse(sampleSalesEntry);
    const inferToType: SalesEntry = parsed;
    const typeToInfer: z.infer<typeof salesEntryRowSchema> = sampleSalesEntry;
    expect(inferToType).toEqual(sampleSalesEntry);
    expect(typeToInfer).toEqual(sampleSalesEntry);
  });
});
