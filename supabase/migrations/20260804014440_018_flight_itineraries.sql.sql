/*
# Create flight_itineraries table for Flight Document Ops Pro

## Purpose
Store generated flight itineraries produced by the Flight Document Ops Pro module.
Each record represents one generated DOCX itinerary with its source data.

## New Tables
- flight_itineraries
  - id (uuid PK)
  - group_number (text)
  - group_name (text)
  - tour_leader (text)
  - agent_name (text)
  - adult_pax (integer)
  - child_pax (integer)
  - total_pax (integer)
  - itinerary_type (text) — 'group' or 'individual'
  - itinerary_data (jsonb) — full passenger, segment, hotel data
  - docx_file_path (text) — storage path for generated DOCX
  - template_version (text default 'blank_template_v1')
  - source_ticket_files (text[]) — filenames of source tickets
  - processing_batch (text)
  - generated_by (uuid) — staff who generated it
  - generated_by_name (text)
  - version (integer default 1) — supports regeneration
  - created_at, updated_at (timestamptz)

## Security
- RLS enabled
- SELECT: authenticated (all staff can view)
- INSERT/UPDATE/DELETE: authenticated (all staff can generate)
*/

CREATE TABLE IF NOT EXISTS flight_itineraries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_number text,
  group_name text NOT NULL,
  tour_leader text,
  agent_name text,
  adult_pax integer DEFAULT 0,
  child_pax integer DEFAULT 0,
  total_pax integer DEFAULT 0,
  itinerary_type text NOT NULL DEFAULT 'group',
  itinerary_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  docx_file_path text,
  template_version text NOT NULL DEFAULT 'blank_template_v1',
  source_ticket_files text[] DEFAULT '{}',
  processing_batch text,
  generated_by uuid,
  generated_by_name text,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE flight_itineraries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_flight_itineraries" ON flight_itineraries;
CREATE POLICY "select_flight_itineraries" ON flight_itineraries FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_flight_itineraries" ON flight_itineraries;
CREATE POLICY "insert_flight_itineraries" ON flight_itineraries FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_flight_itineraries" ON flight_itineraries;
CREATE POLICY "update_flight_itineraries" ON flight_itineraries FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_flight_itineraries" ON flight_itineraries;
CREATE POLICY "delete_flight_itineraries" ON flight_itineraries FOR DELETE
  TO authenticated USING (true);
