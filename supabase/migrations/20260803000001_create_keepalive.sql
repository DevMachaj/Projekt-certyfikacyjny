-- Keep-alive ping target for the Supabase free tier.
--
-- A free-tier project is paused after 7 days without database activity, and a paused
-- project serves a dead link to anyone opening the deployment. `.github/workflows/
-- keepalive.yml` writes to this table once a day so that timer never runs out. The
-- write has to reach Postgres — opening the dashboard does not reset the timer.
--
-- Exactly one row, updated in place, so the table never grows. The BEFORE UPDATE
-- trigger stamps the time and bumps the counter, which keeps the workflow's request
-- body a constant `{"id":1}` and leaves an audit trail of how many pings landed.
--
-- Access is service_role only, stated twice on purpose. RLS is enabled with *no*
-- policies, so anon and authenticated are denied every operation (RLS default-denies
-- when no policy matches); the REVOKE says the same thing at the GRANT layer, so the
-- table stays unreachable with the public anon key even if a later migration adds a
-- policy by mistake. service_role carries BYPASSRLS and its key lives only in
-- Cloudflare and GitHub secrets, never in a client bundle.

CREATE TABLE public.keepalive (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_ping_at timestamptz NOT NULL DEFAULT now(),
  ping_count bigint NOT NULL DEFAULT 0
);

INSERT INTO public.keepalive (id) VALUES (1);

ALTER TABLE public.keepalive ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.keepalive FROM anon, authenticated;
GRANT SELECT, UPDATE ON public.keepalive TO service_role;

CREATE FUNCTION public.keepalive_touch() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
BEGIN
  NEW.last_ping_at := now();
  NEW.ping_count := OLD.ping_count + 1;
  RETURN NEW;
END;
$$;

CREATE TRIGGER keepalive_touch
  BEFORE UPDATE ON public.keepalive
  FOR EACH ROW EXECUTE FUNCTION public.keepalive_touch();
