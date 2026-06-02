-- Scope the name uniqueness constraint to within a group instead of globally.
-- Before: UNIQUE(name) — prevented same name across different groups (wrong)
-- After:  UNIQUE(name, group_id) — allows same name in different groups
ALTER TABLE stock_items DROP CONSTRAINT stock_items_name_key;
ALTER TABLE stock_items ADD CONSTRAINT stock_items_name_group_id_key UNIQUE (name, group_id);
