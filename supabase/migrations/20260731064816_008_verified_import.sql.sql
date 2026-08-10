/*
# Verified Pilgrim Import Schema

## Purpose
Supports one-time verified pilgrim import from CSV with:
- New pilgrim columns for visa, hotel, transportation, arrival port, contract record date, import metadata
- Internal agent code on sub_agents for auto-generated codes on new agents
- Import review queue table for REVIEW rows that need correction before activation
- Import batches table for tracking import operations

## New Columns on `pilgrims`
- `visa_number` (text, nullable) — visa number preserved as text
- `makkah_hotel` (text, nullable) — Makkah hotel name from import
- `madinah_hotel` (text, nullable) — Madinah hotel name from import
- `transportation` (text, nullable) — transportation arrangement from import
- `visa_company` (text, nullable) — visa company from import
- `arrival_port` (text, nullable) — arrival port from import
- `contract_record_date` (date, nullable) — contract record date from import
- `source_sheet` (text, nullable) — original Excel sheet (JUL, AUG, SEPT)
- `source_row` (integer, nullable) — original Excel row number
- `import_batch_id` (uuid, nullable) — links to the import batch

## New Columns on `sub_agents`
- `internal_code` (text, nullable) — auto-generated internal agent code
- `agent_match_key` (text, nullable) — the normalized match key used during import

## New Table: `import_review_queue`
Stores REVIEW rows from the CSV that cannot be auto-imported.
## New Table: `import_batches`
Tracks each import operation with audit metadata.

## Security
- RLS enabled on both new tables, scoped to authenticated users.
*/

ALTER TABLE pilgrims ADD COLUMN IF NOT EXISTS visa_number text;
ALTER TABLE pilgrims ADD COLUMN IF NOT EXISTS makkah_hotel text;
ALTER TABLE pilgrims ADD COLUMN IF NOT EXISTS madinah_hotel text;
ALTER TABLE pilgrims ADD COLUMN IF NOT EXISTS transportation text;
ALTER TABLE pilgrims ADD COLUMN IF NOT EXISTS visa_company text;
ALTER TABLE pilgrims ADD COLUMN IF NOT EXISTS arrival_port text;
ALTER TABLE pilgrims ADD COLUMN IF NOT EXISTS contract_record_date date;
ALTER TABLE pilgrims ADD COLUMN IF NOT EXISTS source_sheet text;
ALTER TABLE pilgrims ADD COLUMN IF NOT EXISTS source_row integer;
ALTER TABLE pilgrims ADD COLUMN IF NOT EXISTS import_batch_id uuid;

ALTER TABLE sub_agents ADD COLUMN IF NOT EXISTS internal_code text;
ALTER TABLE sub_agents ADD COLUMN IF NOT EXISTS agent_match_key text;

CREATE INDEX IF NOT EXISTS idx_sub_agents_internal_code ON sub_agents(internal_code);

CREATE TABLE IF NOT EXISTS import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name text NOT NULL,
  file_hash text NOT NULL,
  performed_by uuid,
  performed_by_name text NOT NULL DEFAULT '',
  total_rows integer NOT NULL DEFAULT 0,
  ready_rows integer NOT NULL DEFAULT 0,
  review_rows integer NOT NULL DEFAULT 0,
  pilgrims_created integer NOT NULL DEFAULT 0,
  agents_created integer NOT NULL DEFAULT 0,
  agents_matched integer NOT NULL DEFAULT 0,
  duplicates_skipped integer NOT NULL DEFAULT 0,
  review_queued integer NOT NULL DEFAULT 0,
  demo_agents_removed integer NOT NULL DEFAULT 0,
  demo_pilgrims_removed integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE import_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_import_batches" ON import_batches;
CREATE POLICY "select_import_batches" ON import_batches FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_import_batches" ON import_batches;
CREATE POLICY "insert_import_batches" ON import_batches FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_import_batches" ON import_batches;
CREATE POLICY "update_import_batches" ON import_batches FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS import_review_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid REFERENCES import_batches(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  passport_number text NOT NULL DEFAULT '',
  visa_number text,
  agent_name text,
  agent_match_key text,
  departure_date text,
  expected_return_date text,
  makkah_hotel text,
  madinah_hotel text,
  transportation text,
  visa_company text,
  arrival_port text,
  contract_record_date text,
  review_reason text,
  source_sheet text,
  source_row integer,
  original_departure_value text,
  original_return_value text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid
);

ALTER TABLE import_review_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_review_queue" ON import_review_queue;
CREATE POLICY "select_review_queue" ON import_review_queue FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_review_queue" ON import_review_queue;
CREATE POLICY "insert_review_queue" ON import_review_queue FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_review_queue" ON import_review_queue;
CREATE POLICY "update_review_queue" ON import_review_queue FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_review_queue" ON import_review_queue;
CREATE POLICY "delete_review_queue" ON import_review_queue FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_review_queue_batch ON import_review_queue(batch_id);
CREATE INDEX IF NOT EXISTS idx_review_queue_status ON import_review_queue(status);
