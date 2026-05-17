ALTER TABLE stock_items
    ADD COLUMN sorted_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE stock_items SET sorted_at = updated_at;
