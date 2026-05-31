-- Prevent overlapping sales-entry date ranges for the same product (FR-005).
-- The API layer also checks overlap to return a friendly 409; this exclusion
-- constraint is the absolute backstop that makes corruption physically
-- impossible even under a race or a future insert path.
--
-- Inclusive bounds '[]' so adjacent ranges that share no day (e.g. Jan 1-5 and
-- Jan 6-10) do NOT conflict, matching the API-layer overlap semantics.
-- Requires btree_gist for the `product_id WITH =` equality operator in a GiST index.

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE public.sales_entries
  ADD CONSTRAINT sales_entries_no_overlap
  EXCLUDE USING gist (
    product_id WITH =,
    daterange(start_date, end_date, '[]') WITH &&
  );
