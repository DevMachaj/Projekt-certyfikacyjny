-- Allow zero-sales periods in sales_entries.
--
-- The original create migration pinned units_sold > 0. Owners need to log periods during
-- which a product sold nothing: omitting those dead stretches systematically overstates
-- velocity (units / days), which skews every downstream classification toward Understocked.
-- Relaxing to units_sold >= 0 lets a zero-sales range lower the rate honestly. The engine
-- treats a resulting velocity of 0 as a Slow-mover (no finite stock runway), so there is no
-- divide-by-zero.
--
-- Negative quantities remain rejected.

ALTER TABLE public.sales_entries
  DROP CONSTRAINT sales_entries_units_sold_check;

ALTER TABLE public.sales_entries
  ADD CONSTRAINT sales_entries_units_sold_check CHECK (units_sold >= 0);
