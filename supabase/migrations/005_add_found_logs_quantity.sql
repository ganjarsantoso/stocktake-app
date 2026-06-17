-- Run this in Supabase Dashboard → SQL Editor

-- Add quantity column to found_logs so it can be displayed in event cards
ALTER TABLE found_logs ADD COLUMN quantity NUMERIC DEFAULT 0;
