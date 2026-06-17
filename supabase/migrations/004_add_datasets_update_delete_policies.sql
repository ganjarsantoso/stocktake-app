-- Run this in Supabase Dashboard → SQL Editor

-- 1. Allow authenticated users to update datasets
CREATE POLICY "Datasets can be updated by authenticated"
  ON datasets FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 2. Allow authenticated users to delete datasets
CREATE POLICY "Datasets can be deleted by authenticated"
  ON datasets FOR DELETE
  TO authenticated
  USING (true);
