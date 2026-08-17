/*
# Visa & Contract Register — liability record foundation

## Purpose
A Visa & Contract record is an operational entity in its own right, not a
property of a pilgrim. Inna Ataina carries the exposure for every visa it
issues — including visas for a Sub-Agent's client — so responsibility tracking
must begin when the visa is processed, and must not depend on the traveller
already existing in the `pilgrims` table.

This migration adds that entity. It changes no existing table.

## New Tables
- visa_contract_records — one row per visa case, created the moment a visa
  document is read (or manually entered), and updated in place thereafter.

## New Functions
- can_edit_operational_records() — role predicate for operational write access.

## Security
- RLS enabled.
- SELECT: authenticated. This deliberately mirrors the existing `pilgrims_select`
  policy so read visibility is unchanged by the register moving to its own table.
- INSERT: NO policy for `authenticated`. Every row is created server-side by the
  `visa-gemini-extract` Edge Function under the service role, so a browser can
  never forge a record's provenance (`entry_source`) or its creator.
- UPDATE: operational roles only, and the actor must stamp themselves.
- DELETE: admin or higher.

## Known limitation, NOT addressed here
`pilgrims`, `sub_agents` and `flight_itineraries` still carry
`WITH CHECK (true)` write policies, so any authenticated user — including a
`viewer` — can write to them through the REST API. Role enforcement for those
tables presently exists only in the frontend. That is a pre-existing weakness
being handled in a dedicated Security Hardening milestone; this migration
deliberately does not widen its scope to repair it, but the new table does not
repeat the mistake.
*/

-- ============================================================
-- 1. Role predicate
-- ============================================================
-- Mirrors `canEditPilgrims` in src/lib/permissions.ts: operations_staff and
-- above. Viewers are excluded.

CREATE OR REPLACE FUNCTION can_edit_operational_records()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND is_active = true
      AND role IN (
        'platform_owner', 'super_admin', 'admin',
        'operations_manager', 'operations_staff'
      )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION can_edit_operational_records() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION can_edit_operational_records() FROM anon;
GRANT  EXECUTE ON FUNCTION can_edit_operational_records() TO authenticated;

-- ============================================================
-- 2. The register
-- ============================================================

CREATE TABLE IF NOT EXISTS visa_contract_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The business date this case was logged, in the company's operating
  -- timezone. Explicitly Africa/Lagos rather than CURRENT_DATE, whose result
  -- depends on the database's timezone setting. This is NOT a travel date.
  record_date date NOT NULL DEFAULT ((now() AT TIME ZONE 'Africa/Lagos')::date),

  -- ── Identity ──
  -- The reviewed values. What the extractor originally produced is preserved
  -- separately in extraction_metadata, so a correction never erases the
  -- machine's claim. Nullable: a document may not yield every field, and a
  -- blank an officer must type is safer than an invented identifier.
  traveller_name  text,
  passport_number text,
  visa_number     text,
  nationality     text,

  -- ── Responsibility ──
  -- Inna Ataina's own clients and a Sub-Agent's clients are both the company's
  -- exposure, but they aggregate differently, so they are distinguishable.
  -- A direct client has no Sub-Agent row: this follows the existing convention
  -- where `pilgrims.sub_agent_id IS NULL` means unassigned. No placeholder
  -- Sub-Agent is invented to represent the company itself.
  client_source text NOT NULL DEFAULT 'sub_agent'
    CHECK (client_source IN ('direct', 'sub_agent')),
  sub_agent_id uuid REFERENCES sub_agents(id) ON DELETE SET NULL,
  -- Name as it stood when the visa was issued. Kept even if the Sub-Agent is
  -- later renamed or deleted, because the liability trail must stay readable.
  agent_name_snapshot text NOT NULL DEFAULT '',
  assigned_staff_id uuid REFERENCES profiles(id) ON DELETE SET NULL,

  -- ── Contract / operational ──
  visa_company           text,
  planned_departure_date date,
  expected_return_date   date,
  makkah_hotel_id        uuid REFERENCES hotel_references(id) ON DELETE SET NULL,
  makkah_hotel_name      text,
  madinah_hotel_id       uuid REFERENCES hotel_references(id) ON DELETE SET NULL,
  madinah_hotel_name     text,
  transport_package      text
    CHECK (transport_package IS NULL OR transport_package IN
      ('airport_transfers', 'full_route', 'no_transport')),
  transport_summary text,
  arrival_port      text,

  -- ── Lifecycle ──
  -- Three independent axes, deliberately not collapsed into one status. A
  -- record can be REVIEWED_CONFIRMED and PENDING_PILGRIM_MATCH at once, and
  -- that is a complete, valid liability record.
  record_status text NOT NULL DEFAULT 'PENDING_REVIEW'
    CHECK (record_status IN ('PENDING_REVIEW', 'REVIEWED_CONFIRMED')),
  -- How the identity reached the record. Kept apart from record_status so a
  -- manually typed case is never described as machine-extracted.
  entry_source text NOT NULL
    CHECK (entry_source IN ('GEMINI', 'MANUAL')),

  pilgrim_id uuid REFERENCES pilgrims(id) ON DELETE SET NULL,
  pilgrim_match_status text NOT NULL DEFAULT 'PENDING_PILGRIM_MATCH'
    CHECK (pilgrim_match_status IN ('PENDING_PILGRIM_MATCH', 'MATCHED')),

  spreadsheet_sync_status text NOT NULL DEFAULT 'NOT_SYNCED'
    CHECK (spreadsheet_sync_status IN
      ('NOT_SYNCED', 'SYNC_PENDING', 'SYNCED', 'SYNC_FAILED')),

  -- ── Spreadsheet synchronisation (columns only; nothing connects to Google
  --    in this milestone). Enough to re-find the exact row later: the office
  --    register is one workbook with monthly tabs.
  spreadsheet_id      text,
  spreadsheet_tab     text,
  spreadsheet_row_ref text,
  last_synced_at      timestamptz,
  sync_error          text,

  -- ── Document / extraction metadata ──
  -- Operational and audit metadata only. The visa PDF/image bytes are never
  -- stored here or anywhere else.
  source_filename  text,
  source_mime_type text,
  extracted_at     timestamptz,
  extraction_model text,
  -- Per field: the AI original, confidence, whether staff edited it, who
  -- reviewed it and when.
  extraction_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Idempotency. One visa case yields exactly one liability record, however
  -- many times extraction is retried.
  client_case_key uuid NOT NULL,

  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- A responsibility record must not contradict itself.
  CONSTRAINT vcr_responsibility_consistent CHECK (
    (client_source = 'direct'     AND sub_agent_id IS NULL) OR
    (client_source = 'sub_agent'  AND sub_agent_id IS NOT NULL)
  ),

  -- MATCHED is a claim about a specific pilgrim, so it needs one.
  CONSTRAINT vcr_matched_needs_pilgrim CHECK (
    pilgrim_match_status <> 'MATCHED' OR pilgrim_id IS NOT NULL
  )
);

-- One record per visa case. This is what makes a repeated extraction safe.
CREATE UNIQUE INDEX IF NOT EXISTS vcr_client_case_key_idx
  ON visa_contract_records (client_case_key);

-- Deliberately NOT unique. `pilgrims` enforces one row per passport; this table
-- must not, because a traveller holds several visas over time and an unreviewed
-- value may be null or wrong. A unique constraint here would reject a
-- legitimate liability record at the worst possible moment.
CREATE INDEX IF NOT EXISTS vcr_passport_idx
  ON visa_contract_records (lower(passport_number));

CREATE INDEX IF NOT EXISTS vcr_sub_agent_idx    ON visa_contract_records (sub_agent_id);
CREATE INDEX IF NOT EXISTS vcr_client_source_idx ON visa_contract_records (client_source);
CREATE INDEX IF NOT EXISTS vcr_status_idx
  ON visa_contract_records (record_status, pilgrim_match_status);
CREATE INDEX IF NOT EXISTS vcr_record_date_idx  ON visa_contract_records (record_date DESC);
CREATE INDEX IF NOT EXISTS vcr_sync_idx         ON visa_contract_records (spreadsheet_sync_status);
CREATE INDEX IF NOT EXISTS vcr_pilgrim_idx      ON visa_contract_records (pilgrim_id);

-- ============================================================
-- 3. Immutable provenance
-- ============================================================
-- The columns that say who created the record, when, from what source and for
-- which case are the backbone of the liability trail. An UPDATE must not be
-- able to rewrite them, so the trigger restores them rather than trusting the
-- statement. `updated_at` is stamped here so it cannot be back-dated either.

CREATE OR REPLACE FUNCTION visa_contract_records_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  NEW.id              := OLD.id;
  NEW.client_case_key := OLD.client_case_key;
  NEW.entry_source    := OLD.entry_source;
  NEW.created_by      := OLD.created_by;
  NEW.created_at      := OLD.created_at;
  NEW.record_date     := OLD.record_date;
  NEW.updated_at      := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS visa_contract_records_guard_trg ON visa_contract_records;
CREATE TRIGGER visa_contract_records_guard_trg
  BEFORE UPDATE ON visa_contract_records
  FOR EACH ROW EXECUTE FUNCTION visa_contract_records_guard();

-- ============================================================
-- 4. Row level security
-- ============================================================

ALTER TABLE visa_contract_records ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON visa_contract_records FROM anon;

-- Read: every authenticated staff member, matching the existing `pilgrims`
-- read policy exactly. Moving the register to its own table must not change
-- who can see it, in either direction.
DROP POLICY IF EXISTS "visa_contract_records_select" ON visa_contract_records;
CREATE POLICY "visa_contract_records_select" ON visa_contract_records FOR SELECT
  TO authenticated USING (true);

-- Write: no INSERT policy for `authenticated`, by design. Records are created
-- only by the Edge Function under the service role, which resolves the caller
-- from a verified JWT. A browser cannot mint a record, forge `entry_source`,
-- or attribute one to another staff member.

DROP POLICY IF EXISTS "visa_contract_records_update" ON visa_contract_records;
CREATE POLICY "visa_contract_records_update" ON visa_contract_records FOR UPDATE
  TO authenticated
  USING (can_edit_operational_records())
  -- The actor must stamp themselves; `auth.uid()` is the session, so this
  -- cannot be attributed elsewhere.
  WITH CHECK (can_edit_operational_records() AND updated_by = auth.uid());

DROP POLICY IF EXISTS "visa_contract_records_delete" ON visa_contract_records;
CREATE POLICY "visa_contract_records_delete" ON visa_contract_records FOR DELETE
  TO authenticated USING (is_admin_or_higher());
