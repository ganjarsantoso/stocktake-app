-- Allow authenticated users to UPDATE found_logs (revert-fallback, manual corrections)
CREATE POLICY "Found logs can be updated by authenticated"
  ON found_logs FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
