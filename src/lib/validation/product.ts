import { z } from "zod";

/**
 * Shared product validation schema — the single source of truth for product field
 * rules, reused by the API routes (`/api/products`) and the catalog React island.
 *
 * Rules mirror the DB CHECK constraints in
 * `supabase/migrations/20260530000001_create_products.sql` so client and server agree:
 *   - stock_quantity  >= 0
 *   - lead_time_days  > 0 (nullable — FR-007 "if lead time is not set")
 *   - buffer_days     > 0 (DEFAULT 7 in the DB)
 *
 * `lead_time_days` is optional on input and coerced to `null` when omitted, so an
 * empty lead-time field persists as NULL rather than 0 (which would violate the CHECK).
 */
export const productSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  stock_quantity: z.number().int("Stock must be a whole number").min(0, "Stock cannot be negative"),
  lead_time_days: z
    .number()
    .int("Lead time must be a whole number")
    .positive("Lead time must be greater than 0")
    .nullable()
    .default(null),
  buffer_days: z.number().int("Buffer days must be a whole number").positive("Buffer days must be greater than 0"),
});

export type ProductInput = z.infer<typeof productSchema>;

/** Partial variant for PATCH — any subset of fields may be supplied. */
export const productUpdateSchema = productSchema.partial();

export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;
