-- Fix infinite recursion in group_members RLS policy.
-- Apply via Supabase Dashboard SQL Editor.
--
-- The previous policy used a self-referential subquery:
--   group_id IN (SELECT group_id FROM group_members WHERE user_id = auth.uid())
-- This caused infinite recursion when Supabase Realtime's apply_rls evaluated
-- stock_items changes, crashing the Realtime pipeline and silently disabling
-- all sync across every environment.
--
-- Fix: replace with a simple equality check. Each user sees only their own
-- membership rows, which is sufficient for stock_items RLS to derive the
-- caller's group_ids without triggering recursion.
--
-- Groups and members are read-only on the frontend (managed via backend API
-- which runs as the postgres role and bypasses RLS), so this policy change
-- has no visible effect on the application.
--
-- Rollback:
--   DROP POLICY IF EXISTS "group_members authenticated select" ON public.group_members;
--   CREATE POLICY "group_members authenticated select"
--     ON public.group_members FOR SELECT TO authenticated
--     USING (group_id IN (SELECT group_id FROM group_members WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "group_members authenticated select" ON public.group_members;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE POLICY "group_members authenticated select"
      ON public.group_members FOR SELECT TO authenticated
      USING (user_id = auth.uid());
  END IF;
END $$;
