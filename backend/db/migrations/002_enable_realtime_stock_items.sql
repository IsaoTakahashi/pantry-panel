-- Enable Supabase Realtime broadcasting for stock_items.
-- Apply via Supabase Dashboard SQL Editor.
--
-- After applying, stock_items INSERT/UPDATE/DELETE will be streamed to
-- clients subscribed via @supabase/supabase-js postgres_changes.
--
-- REPLICA IDENTITY is left as DEFAULT (primary key only). Clients re-fetch
-- the full list via REST on any event, so DELETE payload only needs `id`.
--
-- Rollback:
--   ALTER PUBLICATION supabase_realtime DROP TABLE public.stock_items;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.stock_items;
  END IF;
END $$;
