CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  stock_quantity integer NOT NULL CHECK (stock_quantity >= 0),
  lead_time_days integer CHECK (lead_time_days > 0),
  buffer_days integer NOT NULL DEFAULT 7 CHECK (buffer_days > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY products_select ON public.products
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY products_insert ON public.products
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY products_update ON public.products
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY products_delete ON public.products
  FOR DELETE USING (auth.uid() = user_id);
