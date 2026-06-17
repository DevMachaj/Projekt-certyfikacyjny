-- Test/demo seed for the restocking dashboard. Idempotent: deletes only these named
-- products for the owner (cascades to their sales_entries), then re-inserts. Does NOT touch
-- any other product. Owner is resolved by email — sign that account up in the app FIRST.
--
-- 9 products spanning all 5 classification states (engine thresholds: MIN_HISTORY_DAYS=7,
-- SLOW_VELOCITY=0.1 units/day, SLOW_DAYS_OF_STOCK=90):
--   Understocked x2, Watch x2, OK x2 (one with no lead time), Slow-mover x2, Insufficient data x1.
-- Run in Supabase Studio → SQL Editor (production) or via psql (local).

DO $$
DECLARE
  uid uuid;
  owner_email text := 'dev.machaj@gmail.com';
BEGIN
  SELECT id INTO uid FROM auth.users WHERE email = owner_email;
  IF uid IS NULL THEN
    RAISE EXCEPTION 'No auth user "%" — sign that account up in the app first, then re-run.', owner_email;
  END IF;

  DELETE FROM public.products
  WHERE user_id = uid
    AND name IN (
      'Cosmic Coffee Beans', 'Nebula Notebooks', 'Stardust Stickers', 'Galaxy Mugs',
      'Orbit Organizers', 'Meteor Mousepads', 'Comet Candles', 'Lunar Lamps',
      'Asteroid Air Fresheners'
    );

  WITH ins AS (
    INSERT INTO public.products (user_id, name, stock_quantity, lead_time_days, buffer_days)
    SELECT uid, name, stock_quantity, lead_time_days, buffer_days
    FROM (VALUES
      -- name,                       stock, lead,      buffer
      ('Cosmic Coffee Beans',           8,  7::int,    7),  -- Understocked: dos 4 < lead 7  → order 28
      ('Nebula Notebooks',              5, 10::int,    5),  -- Understocked: dos 5 < lead 10 → order 15
      ('Stardust Stickers',            12, 10::int,    7),  -- Watch:  lead 10 ≤ dos 12 < 20
      ('Galaxy Mugs',                   7,  8::int,    7),  -- Watch:  lead 8  ≤ dos 14 < 16
      ('Orbit Organizers',             40,  7::int,    7),  -- OK:     dos 40 ≥ 2*lead, < 90
      ('Meteor Mousepads',             20, NULL::int,  7),  -- OK:     no lead time set → set-lead-time nudge
      ('Comet Candles',                15,  7::int,    7),  -- Slow-mover: velocity 0.067 < 0.1
      ('Lunar Lamps',                  50,  8::int,    7),  -- Slow-mover: dos 100 ≥ 90
      ('Asteroid Air Fresheners',      10,  7::int,    7)   -- Insufficient data: only 3 days history
    ) AS v(name, stock_quantity, lead_time_days, buffer_days)
    RETURNING id, name
  )
  INSERT INTO public.sales_entries (product_id, user_id, units_sold, start_date, end_date)
  SELECT ins.id, uid, s.units_sold, s.start_date, s.end_date
  FROM ins
  JOIN (VALUES
    -- name,                       units, start,                end
    ('Cosmic Coffee Beans',          60, DATE '2026-05-01', DATE '2026-05-30'),  -- v = 60/30 = 2.0
    ('Nebula Notebooks',             30, DATE '2026-05-01', DATE '2026-05-30'),  -- v = 30/30 = 1.0
    ('Stardust Stickers',            30, DATE '2026-05-01', DATE '2026-05-30'),  -- v = 1.0
    ('Galaxy Mugs',                  15, DATE '2026-05-01', DATE '2026-05-30'),  -- v = 0.5
    ('Orbit Organizers',             30, DATE '2026-05-01', DATE '2026-05-30'),  -- v = 1.0
    ('Meteor Mousepads',             15, DATE '2026-05-01', DATE '2026-05-30'),  -- v = 0.5
    ('Comet Candles',                 2, DATE '2026-05-01', DATE '2026-05-30'),  -- v = 0.067 (< 0.1)
    ('Lunar Lamps',                  15, DATE '2026-05-01', DATE '2026-05-30'),  -- v = 0.5 → dos 100
    ('Asteroid Air Fresheners',       6, DATE '2026-06-10', DATE '2026-06-12')   -- 3 days < 7 → Insufficient
  ) AS s(name, units_sold, start_date, end_date) ON s.name = ins.name;

  RAISE NOTICE 'Seeded 9 demo products + sales for %', owner_email;
END $$;
