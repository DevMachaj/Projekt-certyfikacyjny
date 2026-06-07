import type { APIRoute } from "astro";
import type { PostgrestError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase";
import { createSalesEntry, getProductById, getSalesEntriesByProduct } from "@/lib/db";
import { classify } from "@/lib/classification";
import { salesEntrySchema } from "@/lib/validation/sales-entry";
import type { SalesEntry } from "@/types";

export const prerender = false;

const OVERLAP_MESSAGE = "This date range overlaps an existing sales entry for this product.";
/** Postgres exclusion_violation — raised by the sales_entries_no_overlap GiST constraint. */
const EXCLUSION_VIOLATION = "23P01";

/**
 * Inclusive-endpoint overlap test: two ranges overlap iff aStart <= bEnd AND bStart <= aEnd.
 * `YYYY-MM-DD` strings compare lexicographically, matching the DB `daterange(..., '[]')` constraint.
 */
function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

export const GET: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return Response.json({ error: "Supabase is not configured" }, { status: 503 });
  }

  const id = context.params.id;
  if (!id) {
    return Response.json({ error: "Missing product id" }, { status: 400 });
  }

  try {
    const product = await getProductById(supabase, id);
    if (!product) {
      return Response.json({ error: "Product not found" }, { status: 404 });
    }

    const entries = await getSalesEntriesByProduct(supabase, id);
    const classification = classify(product, entries);
    return Response.json({ entries, classification }, { status: 200 });
  } catch {
    return Response.json({ error: "Failed to load sales entries" }, { status: 500 });
  }
};

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return Response.json({ error: "Supabase is not configured" }, { status: 503 });
  }

  const id = context.params.id;
  if (!id) {
    return Response.json({ error: "Missing product id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = salesEntrySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const product = await getProductById(supabase, id);
    if (!product) {
      return Response.json({ error: "Product not found" }, { status: 404 });
    }

    // API-layer overlap check (friendly 409). The DB exclusion constraint is the backstop below.
    const existing = await getSalesEntriesByProduct(supabase, id);
    const conflict = existing.some((entry) =>
      rangesOverlap(parsed.data.start_date, parsed.data.end_date, entry.start_date, entry.end_date),
    );
    if (conflict) {
      return Response.json({ error: OVERLAP_MESSAGE }, { status: 409 });
    }

    let entry: SalesEntry;
    try {
      entry = await createSalesEntry(supabase, user.id, id, parsed.data);
    } catch (err) {
      const code = (err as Partial<PostgrestError>).code;
      if (code === EXCLUSION_VIOLATION) {
        return Response.json({ error: OVERLAP_MESSAGE }, { status: 409 });
      }
      throw err;
    }

    // Recompute over the post-insert set (existing + new) so the UI updates in one round-trip (NFR-001).
    const classification = classify(product, [...existing, entry]);
    return Response.json({ entry, classification }, { status: 201 });
  } catch {
    return Response.json({ error: "Failed to create sales entry" }, { status: 500 });
  }
};
