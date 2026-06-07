-- Add a WITH CHECK clause to the sales_entries UPDATE policy.
--
-- The original create migration gave sales_entries_update only a USING clause, which
-- gates *which* rows a user may update (their own) but leaves the *new* row values
-- unconstrained. A user could therefore update one of their own entries and repoint
-- product_id at a product they do not own — exactly the cross-user association the
-- INSERT policy already blocks via an EXISTS check. This brings UPDATE to parity with
-- INSERT (and with the products UPDATE policy, which already carries WITH CHECK).

DROP POLICY sales_entries_update ON public.sales_entries;

CREATE POLICY sales_entries_update ON public.sales_entries
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.products
      WHERE products.id = product_id
        AND products.user_id = auth.uid()
    )
  );
