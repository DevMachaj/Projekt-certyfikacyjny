import type { APIRoute } from "astro";
import { createClient, createAdminClient } from "@/lib/supabase";

export const prerender = false;

/**
 * Permanently hard-deletes the authenticated caller's account. The caller id is re-derived
 * server-side from the session (never trusted from the client), then `auth.admin.deleteUser`
 * removes the `auth.users` row — DB ON DELETE CASCADE wipes products + sales_entries.
 *
 * Failure handling: supabase-js admin/auth methods return `{ error }` (they don't throw on API
 * errors), so the returned error is inspected explicitly and only a null error reaches the success
 * branch. A non-null error or a network throw returns the `{ error }` JSON contract WITHOUT signing
 * out, leaving the session + data intact. A successful delete is the point of no return: signOut is
 * best-effort and never converts into a non-200.
 *
 * CSRF: this destructive DELETE is authenticated by the SSR session cookie alone. Cross-site
 * forgery is blocked because `@supabase/ssr` issues the auth cookies with `SameSite=Lax` (its
 * default), so they are not sent on cross-site DELETEs, and a cross-origin call additionally trips
 * a CORS preflight this app does not answer. There is no explicit Origin check — that protection
 * relies on the SameSite=Lax default staying in place; revisit if the cookie config changes.
 */
export const DELETE: APIRoute = async (context) => {
  if (!context.locals.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  const adminClient = createAdminClient();
  if (!supabase || !adminClient) {
    return Response.json({ error: "Account deletion is not configured" }, { status: 503 });
  }

  // Re-derive the caller id from the session — never trust a client-supplied id.
  let userId: string;
  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    userId = user.id;
  } catch {
    return Response.json({ error: "Failed to verify session" }, { status: 500 });
  }

  // Inspect the returned error (admin methods don't throw on API errors); wrap for network throws.
  try {
    const { error } = await adminClient.auth.admin.deleteUser(userId);
    if (error) {
      return Response.json({ error: "Failed to delete account" }, { status: 500 });
    }
  } catch {
    return Response.json({ error: "Failed to delete account" }, { status: 500 });
  }

  // Point of no return: the account is gone. Clear the session best-effort; never fail the request.
  try {
    await supabase.auth.signOut();
  } catch {
    // Swallow — the deleted user's token is inert and middleware getUser returns null next request.
  }

  return Response.json({ ok: true }, { status: 200 });
};
