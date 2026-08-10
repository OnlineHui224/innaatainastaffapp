/*
# Add external_hotel_id column to hotel_references

## Purpose
Add a column to store the original CSV Hotel ID from the company hotel list
for matching during future CSV imports.

## Safety
- Uses DO $$ block with IF NOT EXISTS to be idempotent
- No data is lost or modified
*/

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hotel_references' AND column_name = 'external_hotel_id') THEN
    ALTER TABLE hotel_references ADD COLUMN external_hotel_id text;
  END IF;
END $$;
