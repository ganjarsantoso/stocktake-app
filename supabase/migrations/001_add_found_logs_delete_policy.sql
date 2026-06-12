-- Run this in Supabase Dashboard → SQL Editor

-- 1. SECURITY DEFINER function (bypasses RLS, runs as owner)
--    The client calls: supabase.rpc('revert_found_log', { log_id })
CREATE OR REPLACE FUNCTION revert_found_log(log_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM found_logs WHERE id = log_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'found_log not found: %', log_id;
  END IF;
END;
$$;

-- 2. Allow authenticated users to delete directly (for bulk/table operations)
CREATE POLICY "Found logs can be deleted by authenticated"
  ON found_logs FOR DELETE
  TO authenticated
  USING (true);
