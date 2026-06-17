import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { getProductsByUser, getSalesEntriesByUser } from "@/lib/db";
import { classifyUserCatalog } from "@/lib/dashboard";
import { buildDeterministicPlan, selectRestockCandidates } from "@/lib/restocking";
import { AiUnconfiguredError, isConfigured, summarizeRestockPlan } from "@/lib/services/restocking-summary";

export const prerender = false;

/**
 * Generate the weekly restocking plan for the authenticated user. No request body — the selection is
 * derived server-side from the user's catalog. Orchestrates: load → classify → select →
 * (empty short-circuit | summarize). The engine builds the plan; the LLM only rewords the summary.
 *
 * 401 unauthenticated; 503 if Supabase or the AI key is unset; 500 on a DB error (per the lessons
 * rule — db helpers throw, so the load is try/catch-wrapped to preserve the `{ error }` JSON contract).
 */
export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return Response.json({ error: "Supabase is not configured" }, { status: 503 });
  }

  if (!isConfigured()) {
    return Response.json({ error: "AI summary is not configured" }, { status: 503 });
  }

  try {
    const products = await getProductsByUser(supabase, user.id);
    const entries = await getSalesEntriesByUser(supabase, user.id);
    const candidates = selectRestockCandidates(classifyUserCatalog(products, entries));

    // Nothing to reorder → engine-built empty plan, no LLM call (no tokens spent).
    if (candidates.length === 0) {
      return Response.json({ ...buildDeterministicPlan([]), source: "empty" }, { status: 200 });
    }

    const plan = await summarizeRestockPlan(candidates);
    return Response.json(plan, { status: 200 });
  } catch (e) {
    // Belt-and-suspenders with the upfront isConfigured check.
    if (e instanceof AiUnconfiguredError) {
      return Response.json({ error: "AI summary is not configured" }, { status: 503 });
    }
    return Response.json({ error: "Failed to generate restocking plan" }, { status: 500 });
  }
};
