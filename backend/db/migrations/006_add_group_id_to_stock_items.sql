-- group_id を nullable で追加（既存行は Plan C のデータ移行で埋める）
ALTER TABLE stock_items
    ADD COLUMN group_id UUID REFERENCES groups(id);
