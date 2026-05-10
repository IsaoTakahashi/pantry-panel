-- LEARNING-ONLY MIGRATION
-- Do NOT apply this to Supabase production.
-- Apply only to the local compose Postgres for Phase 3 learning purposes.
--
-- This trigger sends a JSON payload via pg_notify('stock_items_changed', ...)
-- on every INSERT/UPDATE/DELETE of stock_items rows.

CREATE OR REPLACE FUNCTION notify_stock_items_change() RETURNS trigger AS $$
DECLARE
  payload jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    payload := jsonb_build_object(
      'type', 'stock_items.deleted',
      'payload', jsonb_build_object('id', OLD.id)
    );
  ELSIF TG_OP = 'INSERT' THEN
    payload := jsonb_build_object(
      'type', 'stock_items.created',
      'payload', to_jsonb(NEW)
    );
  ELSE
    payload := jsonb_build_object(
      'type', 'stock_items.updated',
      'payload', to_jsonb(NEW)
    );
  END IF;
  PERFORM pg_notify('stock_items_changed', payload::text);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER stock_items_notify
  AFTER INSERT OR UPDATE OR DELETE ON stock_items
  FOR EACH ROW EXECUTE FUNCTION notify_stock_items_change();
