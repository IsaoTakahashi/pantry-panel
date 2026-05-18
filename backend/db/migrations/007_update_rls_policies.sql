-- stock_items の既存ポリシーをグループ単位に更新
-- Apply via Supabase Dashboard SQL Editor.
-- Rollback:
--   DROP POLICY IF EXISTS "stock_items authenticated select" ON public.stock_items;
--   CREATE POLICY "stock_items authenticated select" ON public.stock_items FOR SELECT TO authenticated USING (true);
--   DROP POLICY "stock_items anon select" ON public.stock_items;（旧 anon ポリシーが必要な場合のみ）

-- 旧ポリシーを削除
DROP POLICY IF EXISTS "stock_items authenticated select" ON public.stock_items;
DROP POLICY IF EXISTS "stock_items anon select" ON public.stock_items;

-- authenticated: 自分のグループの行のみ SELECT
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE POLICY "stock_items authenticated select"
      ON public.stock_items FOR SELECT TO authenticated
      USING (
        group_id IN (
          SELECT group_id FROM group_members
          WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- group_members RLS
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE POLICY "group_members authenticated select"
      ON public.group_members FOR SELECT TO authenticated
      USING (
        group_id IN (
          SELECT group_id FROM group_members WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- invitations RLS
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE POLICY "invitations authenticated select"
      ON public.invitations FOR SELECT TO authenticated
      USING (
        group_id IN (
          SELECT group_id FROM group_members WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;
