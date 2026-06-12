-- StockTake App - Supabase Schema
-- Run this in your Supabase SQL Editor

DROP TABLE IF EXISTS found_logs CASCADE;
DROP TABLE IF EXISTS items CASCADE;
DROP TABLE IF EXISTS datasets CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Users
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supabase_uid UUID UNIQUE,
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read all users"
  ON users FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert own record"
  ON users FOR INSERT
  TO authenticated
  WITH CHECK (supabase_uid = auth.uid());

CREATE POLICY "Users can update own record"
  ON users FOR UPDATE
  TO authenticated
  USING (supabase_uid = auth.uid())
  WITH CHECK (supabase_uid = auth.uid());

-- Datasets
CREATE TABLE datasets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_by UUID REFERENCES users(id),
  header_mapping JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE datasets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Datasets are readable by all authenticated"
  ON datasets FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Datasets can be created by authenticated"
  ON datasets FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Items
CREATE TABLE items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id UUID REFERENCES datasets(id) ON DELETE CASCADE,
  storage_bin TEXT,
  storage_type TEXT,
  material_no TEXT NOT NULL,
  material_description TEXT,
  batch TEXT,
  storage_unit TEXT NOT NULL,
  quantity NUMERIC DEFAULT 0,
  unit_of_quantity TEXT,
  UNIQUE(dataset_id, storage_unit)
);

CREATE INDEX idx_items_storage_unit ON items(storage_unit);
CREATE INDEX idx_items_storage_unit_suffix ON items(SUBSTRING(storage_unit, GREATEST(LENGTH(storage_unit) - 4, 1), 5));

ALTER TABLE items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Items are readable by all authenticated"
  ON items FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Items can be inserted by authenticated"
  ON items FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Found logs
CREATE TABLE found_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID REFERENCES items(id) UNIQUE,
  dataset_id UUID REFERENCES datasets(id),
  found_by UUID REFERENCES users(id),
  found_by_name TEXT,
  material_no TEXT,
  material_description TEXT,
  storage_unit TEXT,
  storage_bin TEXT,
  batch TEXT,
  is_manual BOOLEAN DEFAULT false,
  client_created_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  reverted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_found_logs_dataset ON found_logs(dataset_id);
CREATE INDEX IF NOT EXISTS idx_found_logs_created ON found_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_found_logs_item ON found_logs(item_id);

ALTER TABLE found_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Found logs are readable by all authenticated"
  ON found_logs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Found logs can be inserted by authenticated"
  ON found_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Found logs can be updated by authenticated"
  ON found_logs FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Found logs can be deleted by authenticated"
  ON found_logs FOR DELETE
  TO authenticated
  USING (true);

-- Enable Realtime for found_logs
ALTER PUBLICATION supabase_realtime ADD TABLE found_logs;

-- SECURITY DEFINER function for reverting found_logs (bypasses RLS, soft-revert)
CREATE OR REPLACE FUNCTION revert_found_log(log_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE found_logs
  SET reverted_at = now(), item_id = NULL
  WHERE id = log_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'found_log not found: %', log_id;
  END IF;
END;
$$;
