import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { deleteProduct, updateProduct } from "@/lib/db";
import { productUpdateSchema } from "@/lib/validation/product";

export const prerender = false;

export const PATCH: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return Response.json({ error: "Supabase is not configured" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = productUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 400 });
  }

  const id = context.params.id;
  if (!id) {
    return Response.json({ error: "Missing product id" }, { status: 400 });
  }

  const product = await updateProduct(supabase, id, parsed.data);
  if (!product) {
    return Response.json({ error: "Product not found" }, { status: 404 });
  }

  return Response.json({ product }, { status: 200 });
};

export const DELETE: APIRoute = async (context) => {
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

  // Deleting the product row removes its sales entries via DB ON DELETE CASCADE.
  const removed = await deleteProduct(supabase, id);
  if (!removed) {
    return Response.json({ error: "Product not found" }, { status: 404 });
  }

  return new Response(null, { status: 204 });
};
