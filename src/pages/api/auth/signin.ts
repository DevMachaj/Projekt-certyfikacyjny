import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const email = form.get("email") as string;
  const password = form.get("password") as string;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/auth/signin?error=${encodeURIComponent("Supabase is not configured")}`);
  }
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // error.message can be an unhelpful "{}" when the Auth server is unreachable or returns an
    // empty body (e.g. a misconfigured SUPABASE_URL). Surface the status/code so failures aren't opaque.
    const detail =
      error.message && error.message !== "{}"
        ? error.message
        : `auth unreachable (status ${error.status ?? "?"}, code ${error.code ?? "?"})`;
    return context.redirect(`/auth/signin?error=${encodeURIComponent(detail)}`);
  }

  return context.redirect("/");
};
