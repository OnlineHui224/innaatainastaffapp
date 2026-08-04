
/*
# Create pilgrims table

1. Purpose
   Core table storing pilgrim records for the HajjERP platform.

2. New Tables
   - `pilgrims`
     - `id` (uuid, PK)
     - `full_name` (text, not null)
     - `passport_number` (text, not null, unique)
     - `nationality` (text, not null)
     - `phone_number` (text)
     - `gender` (text, nullable)
     - `date_of_birth` (date, nullable)
     - `sub_agent_id` (uuid, nullable, references sub_agents ON DELETE SET NULL)
     - `arrival_date` (date, nullable)
     - `expected_departure_date` (date, not null)
     - `actual_departure_date` (date, nullable)
     - `operational_notes` (text, nullable)
     - `is_sample_data` (boolean, default false)
     - `created_at` (timestamptz)
     - `updated_at` (timestamptz)
     - `created_by` (uuid, references profiles)
     - `updated_by` (uuid, references profiles)

3. Security
   - RLS enabled
   - All authenticated staff can read pilgrims
   - All authenticated staff can create/update pilgrims
   - Only admins can delete pilgrims

4. Notes
   - journey_status is NOT stored; it is calculated at runtime from dates
   - sub_agent_id uses ON DELETE SET NULL so deleting a sub-agent never silently removes pilgrims
   - Unique passport number constraint enforces no duplicates
*/

CREATE TABLE IF NOT EXISTS pilgrims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  passport_number text NOT NULL,
  nationality text NOT NULL,
  phone_number text,
  gender text CHECK (gender IS NULL OR gender IN ('male', 'female')),
  date_of_birth date,
  sub_agent_id uuid REFERENCES sub_agents(id) ON DELETE SET NULL,
  arrival_date date,
  expected_departure_date date NOT NULL,
  actual_departure_date date,
  operational_notes text,
  is_sample_data boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES profiles(id) ON DELETE SET NULL
);

-- Unique passport number
CREATE UNIQUE INDEX IF NOT EXISTS pilgrims_passport_number_unique_idx
  ON pilgrims (lower(passport_number));

-- Search index
CREATE INDEX IF NOT EXISTS pilgrims_search_idx ON pilgrims (full_name, nationality, phone_number, passport_number);
CREATE INDEX IF NOT EXISTS pilgrims_sub_agent_idx ON pilgrims (sub_agent_id);
CREATE INDEX IF NOT EXISTS pilgrims_dates_idx ON pilgrims (arrival_date, expected_departure_date, actual_departure_date);

ALTER TABLE pilgrims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pilgrims_select" ON pilgrims;
CREATE POLICY "pilgrims_select" ON pilgrims FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "pilgrims_insert" ON pilgrims;
CREATE POLICY "pilgrims_insert" ON pilgrims FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "pilgrims_update" ON pilgrims;
CREATE POLICY "pilgrims_update" ON pilgrims FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "pilgrims_delete" ON pilgrims;
CREATE POLICY "pilgrims_delete" ON pilgrims FOR DELETE
  TO authenticated USING (is_admin());
