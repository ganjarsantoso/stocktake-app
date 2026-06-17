-- Run this in Supabase Dashboard → SQL Editor

-- Add quantity + unit_of_quantity columns to found_logs for event card display
ALTER TABLE found_logs ADD COLUMN quantity NUMERIC DEFAULT 0;
ALTER TABLE found_logs ADD COLUMN unit_of_quantity TEXT;
