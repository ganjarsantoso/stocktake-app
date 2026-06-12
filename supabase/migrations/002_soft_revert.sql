-- Run this in Supabase Dashboard → SQL Editor

-- Add reverted_at column for soft-revert
ALTER TABLE found_logs ADD COLUMN IF NOT EXISTS reverted_at TIMESTAMPTZ;

-- Update revert_found_log to soft-revert (keep row, mark as reverted)
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
