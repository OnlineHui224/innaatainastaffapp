
/*
# Create sub_agents table

1. Purpose
   Stores sub-agent organisations that refer pilgrims to Inna Ataina Travels.

2. New Tables
   - `sub_agents`
     - `id` (uuid, PK)
     - `organisation_name` (text, not null)
     - `contact_person` (text, not null)
     - `country` (text, not null)
     - `email` (text)
     - `phone_number` (text)
     - `active_status` (boolean, default true)
     - `notes` (text, nullable)
     - `created_at` (timestamptz)
     - `updated_at` (timestamptz)
     - `created_by` (uuid, references profiles)
     - `updated_by` (uuid, references profiles)

3. Security
   - RLS enabled
   - All authenticated staff can read sub_agents
   - All authenticated staff can create/update sub_agents
   - Only admins can delete sub_agents
*/

CREATE TABLE IF NOT EXISTS sub_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_name text NOT NULL,
  contact_person text NOT NULL,
  country text NOT NULL DEFAULT '',
  email text,
  phone_number text,
  active_status boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES profiles(id) ON DELETE SET NULL
);

ALTER TABLE sub_agents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sub_agents_select" ON sub_agents;
CREATE POLICY "sub_agents_select" ON sub_agents FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "sub_agents_insert" ON sub_agents;
CREATE POLICY "sub_agents_insert" ON sub_agents FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "sub_agents_update" ON sub_agents;
CREATE POLICY "sub_agents_update" ON sub_agents FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "sub_agents_delete" ON sub_agents;
CREATE POLICY "sub_agents_delete" ON sub_agents FOR DELETE
  TO authenticated USING (is_admin());
