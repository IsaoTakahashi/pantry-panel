-- Enable Row-Level Security on stock_items and grant SELECT only to anon.
-- Apply via Supabase Dashboard SQL Editor.
--
-- Frontend connects with the public anon key to subscribe to Supabase
-- Realtime. Realtime only delivers row changes to roles that have SELECT
-- on the row, so anon needs a permissive SELECT policy. All writes must
-- continue to go through the Lambda backend (postgres role, which bypasses
-- RLS by default), so anon is denied INSERT/UPDATE/DELETE.
--
-- The `authenticated` role also gets SELECT for future readiness; the app
-- is currently auth-less (family-shared) but the wishlist tracks Google
-- auth as a possible later addition.
--
-- Rollback:
--   DROP POLICY IF EXISTS "stock_items anon select" ON public.stock_items;
--   DROP POLICY IF EXISTS "stock_items authenticated select" ON public.stock_items;
--   ALTER TABLE public.stock_items DISABLE ROW LEVEL SECURITY;

ALTER TABLE public.stock_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE POLICY "stock_items anon select"
      ON public.stock_items FOR SELECT TO anon USING (true);
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE POLICY "stock_items authenticated select"
      ON public.stock_items FOR SELECT TO authenticated USING (true);
  END IF;
END $$;
