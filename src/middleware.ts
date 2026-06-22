import { defineMiddleware } from "astro:middleware";
import { createClient } from "@/lib/supabase";

const PROTECTED_ROUTES = ["/dashboard", "/products", "/account"];

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createClient(context.request.headers, context.cookies);

  if (supabase) {
    // Verify the JWT locally with getClaims() (cached JWKS, no network round-trip). getUser()
    // calls the Auth server on every request and was hanging ~25s per page at the edge — since
    // middleware runs on every route, that made every authenticated page slow. getClaims() still
    // validates the token signature, so the route guard stays secure; all data access is also
    // RLS-scoped by the access token.
    const { data, error } = await supabase.auth.getClaims();
    if (data?.claims) {
      context.locals.user = { id: data.claims.sub, email: data.claims.email ?? null };
    } else if (error) {
      // Couldn't verify locally (e.g. a legacy HS256 project) — fall back to the authoritative
      // server check so auth never silently breaks.
      const {
        data: { user },
      } = await supabase.auth.getUser();
      context.locals.user = user ? { id: user.id, email: user.email ?? null } : null;
    } else {
      context.locals.user = null;
    }
  } else {
    context.locals.user = null;
  }

  if (PROTECTED_ROUTES.some((route) => context.url.pathname.startsWith(route))) {
    if (!context.locals.user) {
      return context.redirect("/auth/signin");
    }
  }

  return next();
});
