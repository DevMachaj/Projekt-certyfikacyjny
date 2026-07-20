import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getProductsByUser, getSalesEntriesByUser } from "@/lib/db";
import type { Product, SalesEntry } from "@/types";

interface QueryResult {
  data: unknown;
  error: unknown;
}

/**
 * Minimal chainable Supabase stub. `from().select().eq().order()` all return the same
 * builder, which is itself a thenable resolving to `{ data, error }` — so `await`ing the
 * end of the chain (as db.ts does) yields the configured result. DI in db.ts (the client is
 * a parameter) makes this the only seam we need.
 */
function mockSupabase(result: QueryResult): SupabaseClient {
  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    then: (resolve: (value: QueryResult) => unknown) => resolve(result),
  };
  return { from: () => builder } as unknown as SupabaseClient;
}

const productRow: Product = {
  id: "p1",
  user_id: "u1",
  name: "Widget",
  stock_quantity: 10,
  lead_time_days: 5,
  buffer_days: 7,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const salesRow: SalesEntry = {
  id: "s1",
  product_id: "p1",
  user_id: "u1",
  units_sold: 3,
  start_date: "2026-01-01",
  end_date: "2026-01-07",
  created_at: "2026-01-01T00:00:00Z",
};

describe("getProductsByUser", () => {
  it("returns the rows on success", async () => {
    const supabase = mockSupabase({ data: [productRow], error: null });
    await expect(getProductsByUser(supabase, "u1")).resolves.toEqual([productRow]);
  });

  it("throws when Postgrest returns an error", async () => {
    const supabase = mockSupabase({ data: null, error: { message: "boom" } });
    await expect(getProductsByUser(supabase, "u1")).rejects.toEqual({ message: "boom" });
  });

  it("throws when a returned row fails the row schema (silent drift becomes loud)", async () => {
    const driftedRow = { ...productRow, stock_quantity: "ten" }; // wrong type vs schema
    const supabase = mockSupabase({ data: [driftedRow], error: null });
    await expect(getProductsByUser(supabase, "u1")).rejects.toThrow();
  });
});

describe("getSalesEntriesByUser", () => {
  it("returns the rows on success", async () => {
    const supabase = mockSupabase({ data: [salesRow], error: null });
    await expect(getSalesEntriesByUser(supabase, "u1")).resolves.toEqual([salesRow]);
  });

  it("throws when Postgrest returns an error", async () => {
    const supabase = mockSupabase({ data: null, error: { message: "boom" } });
    await expect(getSalesEntriesByUser(supabase, "u1")).rejects.toEqual({ message: "boom" });
  });

  it("throws when a returned row fails the row schema (missing field)", async () => {
    const missingField: Record<string, unknown> = { ...salesRow };
    delete missingField.units_sold; // drop a required column
    const supabase = mockSupabase({ data: [missingField], error: null });
    await expect(getSalesEntriesByUser(supabase, "u1")).rejects.toThrow();
  });
});
