import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { deleteSalesEntry, getProductById, getSalesEntriesByProduct } from "@/lib/db";
import { classify } from "@/lib/classification";

export const prerender = false;

export const DELETE: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return Response.json({ error: "Supabase is not configured" }, { status: 503 });
  }

  const { id, entryId } = context.params;
  if (!id || !entryId) {
    return Response.json({ error: "Missing product or entry id" }, { status: 400 });
  }

  try {
    // Load the parent product first — RLS-scoped, so a foreign/unknown product surfaces as 404 (isolation).
    const product = await getProductById(supabase, id);
    if (!product) {
      return Response.json({ error: "Product not found" }, { status: 404 });
    }

    const removed = await deleteSalesEntry(supabase, entryId, id);
    if (!removed) {
      return Response.json({ error: "Sales entry not found" }, { status: 404 });
    }

    // Recompute over the remaining entries — may revert to "Insufficient data" if < 7 days remain (US-03).
    const entries = await getSalesEntriesByProduct(supabase, id);
    const classification = classify(product, entries);
    return Response.json({ classification }, { status: 200 });
  } catch {
    return Response.json({ error: "Failed to delete sales entry" }, { status: 500 });
  }
};
