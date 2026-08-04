/*
# Separate Planned Travel Dates from Actual Confirmation Fields

## Purpose
The verified CSV import incorrectly copied the expected return date into
`actual_departure_date`, causing imported pilgrims to falsely show as
"Departure Confirmed." This migration:

1. Adds confirmation metadata columns so that arrival and departure
   require explicit staff action (who, when, optional port/flight/notes).
2. Renames the conceptual use of existing columns by adding a dedicated
   `expected_return_date` column (planned) separate from
   `actual_departure_date` (confirmed).
3. Adds `status_source` to track whether a status came from
   MANUAL_CONFIRMATION, SYSTEM_DERIVED, or CSV_IMPORT.
4. Backs up current pilgrim data into a safety table before any correction.
5. Corrects the false departure confirmations created by the CSV import
   by clearing `actual_departure_date` for records that have no
   confirmation metadata (i.e. were set by import, not by staff).

## New Columns on `pilgrims`
- `actual_arrival_at` (date) — date the pilgrim actually arrived in KSA.
  Set ONLY by a manual "Confirm Arrival" action.
- `arrival_confirmed_at` (timestamptz) — timestamp of the staff confirmation.
- `arrival_confirmed_by` (uuid) — staff profile id who confirmed arrival.
- `arrival_port_actual` (text) — actual arrival port (optional).
- `arrival_flight_number` (text) — flight number for arrival (optional).
- `arrival_notes` (text) — notes for the arrival confirmation (optional).
- `departure_confirmed_at` (timestamptz) — timestamp of the departure confirmation.
- `departure_confirmed_by` (uuid) — staff profile id who confirmed departure.
- `departure_airport` (text) — departure airport (optional).
- `departure_flight_number` (text) — flight number for departure (optional).
- `departure_notes` (text) — notes/evidence for the departure (optional).
- `expected_return_date` (date) — planned return date from CSV/manual entry.
  Distinct from `actual_departure_date` which is the confirmed departure.
- `status_source` (text) — MANUAL_CONFIRMATION | SYSTEM_DERIVED | CSV_IMPORT.
  Defaults to SYSTEM_DERIVED.

## Safety
- A backup table `pilgrims_backup_pre_correction` is created with a full copy.
- No data is deleted. Only `actual_departure_date` is set to NULL for
  records lacking confirmation metadata (the false CSV-import confirmations).
- All existing names, passports, visa numbers, agent assignments, and
  planned dates are preserved.

## RLS
- No new tables exposed to the API (backup table has no RLS / no policies).
- Existing pilgrims policies remain unchanged.
*/

-- 1. Safety backup
CREATE TABLE IF NOT EXISTS pilgrims_backup_pre_correction AS
SELECT * FROM pilgrims;

-- 2. Add confirmation columns to pilgrims
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pilgrims' AND column_name = 'actual_arrival_at') THEN
    ALTER TABLE pilgrims ADD COLUMN actual_arrival_at date;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pilgrims' AND column_name = 'arrival_confirmed_at') THEN
    ALTER TABLE pilgrims ADD COLUMN arrival_confirmed_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pilgrims' AND column_name = 'arrival_confirmed_by') THEN
    ALTER TABLE pilgrims ADD COLUMN arrival_confirmed_by uuid;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pilgrims' AND column_name = 'arrival_port_actual') THEN
    ALTER TABLE pilgrims ADD COLUMN arrival_port_actual text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pilgrims' AND column_name = 'arrival_flight_number') THEN
    ALTER TABLE pilgrims ADD COLUMN arrival_flight_number text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pilgrims' AND column_name = 'arrival_notes') THEN
    ALTER TABLE pilgrims ADD COLUMN arrival_notes text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pilgrims' AND column_name = 'departure_confirmed_at') THEN
    ALTER TABLE pilgrims ADD COLUMN departure_confirmed_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pilgrims' AND column_name = 'departure_confirmed_by') THEN
    ALTER TABLE pilgrims ADD COLUMN departure_confirmed_by uuid;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pilgrims' AND column_name = 'departure_airport') THEN
    ALTER TABLE pilgrims ADD COLUMN departure_airport text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pilgrims' AND column_name = 'departure_flight_number') THEN
    ALTER TABLE pilgrims ADD COLUMN departure_flight_number text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pilgrims' AND column_name = 'departure_notes') THEN
    ALTER TABLE pilgrims ADD COLUMN departure_notes text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pilgrims' AND column_name = 'expected_return_date') THEN
    ALTER TABLE pilgrims ADD COLUMN expected_return_date date;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pilgrims' AND column_name = 'status_source') THEN
    ALTER TABLE pilgrims ADD COLUMN status_source text NOT NULL DEFAULT 'SYSTEM_DERIVED';
  END IF;
END $$;

-- 3. Copy the CSV import's expected return dates into the new planned column
-- The CSV import stored the expected return in actual_departure_date.
-- Move that value to expected_return_date, then clear actual_departure_date
-- for any record that has NO departure confirmation metadata.
UPDATE pilgrims
SET expected_return_date = actual_departure_date
WHERE expected_return_date IS NULL
  AND actual_departure_date IS NOT NULL
  AND departure_confirmed_at IS NULL
  AND departure_confirmed_by IS NULL;

-- 4. Correct false departure confirmations:
-- Clear actual_departure_date where there is no genuine manual confirmation.
UPDATE pilgrims
SET actual_departure_date = NULL,
    status_source = 'CSV_IMPORT'
WHERE actual_departure_date IS NOT NULL
  AND departure_confirmed_at IS NULL
  AND departure_confirmed_by IS NULL;

-- 5. Set status_source for imported records (those with import_batch_id)
UPDATE pilgrims
SET status_source = 'CSV_IMPORT'
WHERE import_batch_id IS NOT NULL
  AND status_source = 'SYSTEM_DERIVED';

-- 6. Verify: show the correction summary
SELECT
  COUNT(*) FILTER (WHERE actual_departure_date IS NOT NULL) as remaining_departures,
  COUNT(*) FILTER (WHERE actual_departure_date IS NULL AND expected_return_date IS NOT NULL) as corrected_to_planned_only,
  COUNT(*) FILTER (WHERE departure_confirmed_at IS NOT NULL AND departure_confirmed_by IS NOT NULL) as genuine_manual_departures,
  COUNT(*) FILTER (WHERE actual_arrival_at IS NOT NULL) as manual_arrivals,
  COUNT(*) as total_pilgrims
FROM pilgrims;
