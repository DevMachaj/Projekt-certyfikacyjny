CREATE TABLE public.sales_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  units_sold integer NOT NULL CHECK (units_sold > 0),
  start_date date NOT NULL,
  end_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT start_before_end CHECK (end_date >= start_date)
);

ALTER TABLE public.sales_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY sales_entries_select ON public.sales_entries
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY sales_entries_insert ON public.sales_entries
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.products
      WHERE products.id = product_id
        AND products.user_id = auth.uid()
    )
  );

CREATE POLICY sales_entries_update ON public.sales_entries
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY sales_entries_delete ON public.sales_entries
  FOR DELETE USING (auth.uid() = user_id);
