-- group_id は Plan C のデータ移行で全行に設定済みのため NOT NULL に変更する。
-- Apply after Plan C data migration is complete.
ALTER TABLE stock_items ALTER COLUMN group_id SET NOT NULL;
