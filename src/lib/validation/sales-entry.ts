import { z } from "zod";

/**
 * Shared sales-entry validation schema — the single source of truth for entry field
 * rules, reused by the API route (`/api/products/[id]/sales-entries`) and the React island.
 *
 * Rules mirror the DB CHECK constraints in
 * `supabase/migrations/20260530000002_create_sales_entries.sql` so client and server agree:
 *   - units_sold >= 0 (a logged period may have zero sales — this lowers velocity rather
 *     than being omitted, so dead periods are not silently dropped from the rate calc)
 *   - end_date >= start_date
 * plus a data-quality rule the DB does not enforce:
 *   - end_date may not be in the future (you cannot have sold units on days that haven't happened),
 *     which would otherwise inflate the day-count and skew velocity / the 7-day threshold.
 *
 * Dates are `YYYY-MM-DD` strings (the SQL `date` column has no time component). Comparisons
 * use lexicographic string ordering, which is correct for zero-padded ISO dates.
 *
 * `product_id` / `user_id` are NOT part of the body — they come from the route param and
 * `locals.user` respectively.
 */

/** Today's date as a `YYYY-MM-DD` string in UTC — the reference point for the future-date rule. */
function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

/** True only for a real calendar date in `YYYY-MM-DD` form (rejects e.g. 2026-02-30). */
function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

const dateString = z.string().refine(isRealDate, "Date must be a valid calendar date in YYYY-MM-DD format");

export const salesEntrySchema = z
  .object({
    units_sold: z.number().int("Units sold must be a whole number").nonnegative("Units sold cannot be negative"),
    start_date: dateString,
    end_date: dateString,
  })
  .refine((entry) => entry.end_date >= entry.start_date, {
    message: "End date must be on or after the start date",
    path: ["end_date"],
  })
  .refine((entry) => entry.end_date <= todayUTC(), {
    message: "End date cannot be in the future",
    path: ["end_date"],
  });

export type SalesEntryInput = z.infer<typeof salesEntrySchema>;
