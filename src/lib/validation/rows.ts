import { z } from "zod";

/**
 * Row schemas — the shape of a **persisted DB row**: a superset of the input schemas in
 * `product.ts` / `sales-entry.ts` with the server-managed columns (`id`, `user_id`,
 * `created_at`, ...). Deliberately distinct from the input schemas: they carry no
 * input-only rules (no "end_date not in the future", no `.default(null)`), only invariants
 * a stored row must hold. These are the single source for validating what `db.ts` reads
 * back; `rows.test.ts` pins them to `src/types.ts` so the two hand-maintained shapes cannot
 * drift. `id`/`user_id`/`product_id` are validated as strings (the DB enforces uuid).
 */

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a YYYY-MM-DD date");

export const productRowSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  name: z.string(),
  stock_quantity: z.number().int().nonnegative(),
  lead_time_days: z.number().int().positive().nullable(),
  buffer_days: z.number().int().positive(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const salesEntryRowSchema = z.object({
  id: z.string(),
  product_id: z.string(),
  user_id: z.string(),
  units_sold: z.number().int().nonnegative(),
  start_date: dateOnly,
  end_date: dateOnly,
  created_at: z.string(),
});
