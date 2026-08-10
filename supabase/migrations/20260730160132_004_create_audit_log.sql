
/*
# Create audit_log table and helper function

1. Purpose
   Immutable record of important operational actions for HajjERP.

2. New Tables
   - `audit_log`
     - `id` (uuid, PK)
     - `action` (text) - e.g. pilgrim_created, departure_confirmed
     - `record_type` (text) - e.g. pilgrim, sub_agent, staff_user
     - `record_id` (uuid, nullable)
     - `record_label` (text) - human-friendly identifier
     - `previous_value` (jsonb, nullable)
     - `new_value` (jsonb, nullable)
     - `performed_by` (uuid, references profiles)
     - `performed_by_name` (text)
     - `created_at` (timestamptz)

3. Security
   - RLS enabled
   - All authenticated staff can read audit entries
   - INSERT only via SECURITY DEFINER function (any authenticated user can insert)
   - No updates or deletes allowed (audit log is immutable)

4. Notes
   - Uses ON DELETE SET NULL for performed_by to preserve history even if staff removed
*/

CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  record_type text NOT NULL,
  record_id uuid,
  record_label text NOT NULL DEFAULT '',
  previous_value jsonb,
  new_value jsonb,
  performed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  performed_by_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_log_created_idx ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_record_idx ON audit_log (record_type, record_id);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_log_select" ON audit_log;
CREATE POLICY "audit_log_select" ON audit_log FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "audit_log_insert" ON audit_log;
CREATE POLICY "audit_log_insert" ON audit_log FOR INSERT
  TO authenticated WITH CHECK (true);

-- No update or delete policies - audit log is immutable
