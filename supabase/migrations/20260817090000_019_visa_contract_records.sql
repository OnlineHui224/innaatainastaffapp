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
  -- RESTRICT, not SET NULL. `SET NULL` would contradict the responsibility
  -- CHECK below — deleting a Sub-Agent would try to leave a sub_agent client
  -- with no Sub-Agent — but more importantly, historical responsibility for an
  -- issued visa must survive. A Sub-Agent holding visa liability cannot be
  -- deleted out from under it; deactivate them with `sub_agents.active_status`
  -- instead.
  sub_agent_id uuid REFERENCES sub_agents(id) ON DELETE RESTRICT,
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
-- 3. Review completeness
-- ============================================================
-- What counts as evidence that a field was actually reviewed by a person:
-- the flag, a reviewer, and a time. All three, for all four fields.
--
-- This is deliberately a plain predicate rather than a state machine. The rule
-- it encodes is the one the whole module exists to protect — a visa identity is
-- confirmed because somebody checked each value against the document, never
-- because a client said so.

CREATE OR REPLACE FUNCTION visa_contract_review_complete(metadata jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    bool_and(
      (metadata #>> ARRAY['fields', key, 'reviewed']) = 'true'
      AND COALESCE(metadata #>> ARRAY['fields', key, 'reviewed_by'], '') <> ''
      AND COALESCE(metadata #>> ARRAY['fields', key, 'reviewed_at'], '') <> ''
    ),
    false
  )
  FROM unnest(ARRAY[
    'passengerName', 'passportNumber', 'visaNumber', 'nationality'
  ]) AS key;
$$;

/**
 * Every identity value is actually present.
 *
 * Review evidence alone is not enough: a record confirmed with a blank passport
 * number is not a usable liability record, and blank is exactly what arrives
 * when a document could not be read. The officer must have typed something.
 */
CREATE OR REPLACE FUNCTION visa_contract_identity_complete(
  traveller_name text, passport_number text, visa_number text, nationality text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(btrim(traveller_name),  '') <> ''
     AND COALESCE(btrim(passport_number), '') <> ''
     AND COALESCE(btrim(visa_number),     '') <> ''
     AND COALESCE(btrim(nationality),     '') <> '';
$$;

/**
 * Every reviewer named in the evidence is a real member of staff.
 *
 * Different officers may review different fields — one person reads the name and
 * passport, a colleague reads the visa number and nationality, and either may
 * perform the final confirmation. That is normal in a staffed operation, and the
 * evidence preserves each person's individual responsibility.
 *
 * What is NOT permitted is a fabricated reviewer. Each `reviewed_by` must
 * resolve to an existing `profiles` row, so review evidence cannot be
 * manufactured by inventing an identifier.
 *
 * Two deliberate choices:
 *   - Compared as text rather than cast to uuid, so a malformed value fails the
 *     check instead of raising a cast error.
 *   - Existence only, not `is_active`. An officer who reviewed a field and has
 *     since left the company still reviewed it; invalidating their past work
 *     would rewrite history rather than protect it.
 *
 * SECURITY DEFINER because the calling trigger runs as the invoker, and a
 * browser role may not be able to see another officer's profile row. It returns
 * a single boolean and discloses nothing further.
 */
CREATE OR REPLACE FUNCTION visa_contract_reviewers_valid(metadata jsonb)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    bool_and(EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id::text = metadata #>> ARRAY['fields', key, 'reviewed_by']
    )),
    false
  )
  FROM unnest(ARRAY[
    'passengerName', 'passportNumber', 'visaNumber', 'nationality'
  ]) AS key;
$$;

-- ============================================================
-- 4. Update guard
-- ============================================================
-- Three jobs, all of them things the client must not be trusted with.
--
--   1. Provenance columns are restored, not trusted. Who created the record,
--      when, from what source and for which case is the backbone of the
--      liability trail.
--   2. REVIEWED_CONFIRMED is refused without review evidence, so an
--      authenticated browser calling PostgREST directly cannot skip the review
--      workflow by simply sending the status.
--   3. Spreadsheet synchronisation columns are restored for anyone other than
--      the server. Google sync does not exist yet in M1; when it arrives in M2
--      it will run server-side, and until then nothing may claim a record was
--      SYNCED.

-- SECURITY INVOKER on purpose. The function needs no elevated rights — it only
-- rewrites NEW — and under SECURITY DEFINER `current_user` would be the owner,
-- so the guard could never tell a browser apart from the server.
CREATE OR REPLACE FUNCTION visa_contract_records_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  -- PostgREST switches the database role per request, so this distinguishes a
  -- service-role Edge Function call from an ordinary authenticated browser.
  is_server boolean := current_user IN ('service_role', 'postgres', 'supabase_admin');
BEGIN
  NEW.id              := OLD.id;
  NEW.client_case_key := OLD.client_case_key;
  NEW.entry_source    := OLD.entry_source;
  NEW.created_by      := OLD.created_by;
  NEW.created_at      := OLD.created_at;
  NEW.record_date     := OLD.record_date;
  NEW.updated_at      := now();

  /* Restore client-controlled columns FIRST, so the confirmation checks below
     run against what is actually stored. Validating before restoring would let
     a browser send forged evidence alongside the status: the check would pass,
     the evidence would then be reverted, and the record would be left confirmed
     on evidence that does not exist. */
  IF NOT is_server THEN
    /* Review evidence is written ONLY by the stamping functions further down,
       which run as SECURITY DEFINER and take the reviewer from auth.uid(). */
    NEW.extraction_metadata := OLD.extraction_metadata;

    NEW.spreadsheet_sync_status := OLD.spreadsheet_sync_status;
    NEW.spreadsheet_id          := OLD.spreadsheet_id;
    NEW.spreadsheet_tab         := OLD.spreadsheet_tab;
    NEW.spreadsheet_row_ref     := OLD.spreadsheet_row_ref;
    NEW.last_synced_at          := OLD.last_synced_at;
    NEW.sync_error              := OLD.sync_error;
  END IF;

  IF NEW.record_status = 'REVIEWED_CONFIRMED' THEN
    IF NOT visa_contract_identity_complete(
         NEW.traveller_name, NEW.passport_number, NEW.visa_number, NEW.nationality) THEN
      RAISE EXCEPTION
        'visa_contract_records: traveller name, passport number, visa number and nationality must all be present before a record can be REVIEWED_CONFIRMED'
        USING ERRCODE = 'check_violation';
    END IF;

    IF NOT visa_contract_review_complete(NEW.extraction_metadata) THEN
      RAISE EXCEPTION
        'visa_contract_records: all four identity fields must be individually reviewed before a record can be REVIEWED_CONFIRMED'
        USING ERRCODE = 'check_violation';
    END IF;

    -- Each named reviewer must be a real member of staff. The reviewers need NOT
    -- be the same person, and need not include the confirming officer: who
    -- reviewed each field lives in `extraction_metadata`, while who performed the
    -- final confirmation is `updated_by` (which RLS pins to auth.uid()) plus the
    -- `visa_contract_review_confirmed` audit entry. Both accountabilities are
    -- recorded, separately.
    IF NOT visa_contract_reviewers_valid(NEW.extraction_metadata) THEN
      RAISE EXCEPTION
        'visa_contract_records: every field review must name a genuine staff member'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS visa_contract_records_guard_trg ON visa_contract_records;
CREATE TRIGGER visa_contract_records_guard_trg
  BEFORE UPDATE ON visa_contract_records
  FOR EACH ROW EXECUTE FUNCTION visa_contract_records_guard();

-- The same rule on the way in. Records are only created server-side today and
-- always start PENDING_REVIEW, so this should never fire — which is exactly why
-- it is cheap to keep.
CREATE OR REPLACE FUNCTION visa_contract_records_insert_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.record_status = 'REVIEWED_CONFIRMED'
     AND NOT (
       visa_contract_identity_complete(
         NEW.traveller_name, NEW.passport_number, NEW.visa_number, NEW.nationality)
       AND visa_contract_review_complete(NEW.extraction_metadata)
       AND visa_contract_reviewers_valid(NEW.extraction_metadata)
     ) THEN
    RAISE EXCEPTION
      'visa_contract_records: a record cannot be created as REVIEWED_CONFIRMED without a complete reviewed identity'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS visa_contract_records_insert_guard_trg ON visa_contract_records;
CREATE TRIGGER visa_contract_records_insert_guard_trg
  BEFORE INSERT ON visa_contract_records
  FOR EACH ROW EXECUTE FUNCTION visa_contract_records_insert_guard();

-- ============================================================
-- 5. Field review — the only way evidence is written
-- ============================================================
-- A review is a claim that a named person checked a value against a document.
-- The browser is therefore allowed to say WHICH field and WHAT value; it is
-- never allowed to say WHO reviewed it or WHEN. Both are stamped here from
-- `auth.uid()` and `now()`, and the update guard above restores
-- `extraction_metadata` for every other write path, so this is the only route.
--
-- Reviews persist the moment they happen, not at final confirmation. A handover
-- part-way through a case is normal, and a colleague must be able to pick it up
-- and see exactly what has already been checked, by whom.

/** The four keys a review may name. Anything else is rejected. */
CREATE OR REPLACE FUNCTION visa_contract_is_identity_field(field text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT field IN ('passengerName', 'passportNumber', 'visaNumber', 'nationality');
$$;

/** The identity column a field key writes to. */
CREATE OR REPLACE FUNCTION visa_contract_identity_column(field text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE field
    WHEN 'passengerName'  THEN 'traveller_name'
    WHEN 'passportNumber' THEN 'passport_number'
    WHEN 'visaNumber'     THEN 'visa_number'
    WHEN 'nationality'    THEN 'nationality'
  END;
$$;

/**
 * Attests that the signed-in officer has reviewed one identity field.
 *
 * Attestation ONLY. It reviews the value already stored on the record; it never
 * writes one. `p_value` is what the officer believes they are attesting to, and
 * a mismatch means the value moved under them — a colleague corrected it while
 * their screen was open — so the review is refused rather than silently applied
 * to something they did not read.
 *
 * That refusal is the point: without it, a direct RPC caller could replace an
 * identity value and mark it reviewed in one step, skipping the correction →
 * withdrawal → explicit re-review path entirely. Corrections go through
 * `visa_contract_clear_field_review` and nowhere else.
 *
 * The reviewer, their display name and the time all come from the server.
 */
CREATE OR REPLACE FUNCTION visa_contract_review_field(
  p_record_id uuid,
  p_field text,
  p_value text
)
RETURNS visa_contract_records
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  actor      uuid := auth.uid();
  actor_name text;
  target     visa_contract_records;
  stored     text;
  updated    visa_contract_records;
BEGIN
  IF actor IS NULL OR NOT can_edit_operational_records() THEN
    RAISE EXCEPTION 'visa_contract_records: not authorised to review this record'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT visa_contract_is_identity_field(p_field) THEN
    RAISE EXCEPTION 'visa_contract_records: % is not a reviewable identity field', p_field
      USING ERRCODE = 'check_violation';
  END IF;

  -- FOR UPDATE so a concurrent correction cannot slip between the comparison
  -- and the stamp, leaving a review attached to a value nobody read.
  SELECT * INTO target FROM visa_contract_records WHERE id = p_record_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'visa_contract_records: record not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  stored := to_jsonb(target) ->> visa_contract_identity_column(p_field);

  IF COALESCE(btrim(stored), '') = '' THEN
    RAISE EXCEPTION 'visa_contract_records: a blank value cannot be reviewed'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Same trimming the rest of the module uses, so a stray space is not treated
  -- as a different value.
  IF btrim(stored) IS DISTINCT FROM btrim(COALESCE(p_value, '')) THEN
    RAISE EXCEPTION
      'The value changed before this review was recorded. Reload the case and review the current value.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT full_name INTO actor_name FROM profiles WHERE id = actor;

  UPDATE visa_contract_records
     SET extraction_metadata = jsonb_set(
           -- `fields` must already exist: jsonb_set creates only the LAST level
           -- of a path, so setting fields->key on metadata with no `fields`
           -- would silently return it unchanged.
           COALESCE(extraction_metadata, '{}'::jsonb)
             || jsonb_build_object('fields',
                  COALESCE(extraction_metadata -> 'fields', '{}'::jsonb)),
           ARRAY['fields', p_field],
           COALESCE(extraction_metadata #> ARRAY['fields', p_field], '{}'::jsonb)
             || jsonb_build_object(
                  'final_value', btrim(stored),
                  'reviewed', true,
                  'reviewed_by', actor::text,
                  'reviewed_by_name', COALESCE(actor_name, ''),
                  'reviewed_at',
                    to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
                ),
           true
         ),
         updated_by = actor
   WHERE id = p_record_id
   RETURNING * INTO updated;

  RETURN updated;
END;
$$;

/**
 * Records a correction, and withdraws that field's review.
 *
 * Changing a value is not reviewing it. The previous reviewer and time are
 * cleared rather than left standing over a value they never saw — and
 * `previous_review` keeps who it was, so the correction is legible afterwards.
 * A confirmed record returns to PENDING_REVIEW, because it is no longer true
 * that every value on it has been checked.
 *
 * `p_value` NULL means "withdraw the review, keep the value" — an officer
 * retracting an attestation without changing anything.
 */
CREATE OR REPLACE FUNCTION visa_contract_clear_field_review(
  p_record_id uuid,
  p_field text,
  p_value text DEFAULT NULL
)
RETURNS visa_contract_records
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  actor   uuid := auth.uid();
  updated visa_contract_records;
BEGIN
  IF actor IS NULL OR NOT can_edit_operational_records() THEN
    RAISE EXCEPTION 'visa_contract_records: not authorised to edit this record'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT visa_contract_is_identity_field(p_field) THEN
    RAISE EXCEPTION 'visa_contract_records: % is not a reviewable identity field', p_field
      USING ERRCODE = 'check_violation';
  END IF;

  EXECUTE format(
    'UPDATE visa_contract_records
        SET %I = COALESCE($1, %I),
            record_status = ''PENDING_REVIEW'',
            extraction_metadata = jsonb_set(
              -- `fields` must already exist: jsonb_set creates only the LAST
              -- level of a path, so setting fields->key on a metadata object
              -- with no `fields` would silently return it unchanged.
              COALESCE(extraction_metadata, ''{}''::jsonb)
                || jsonb_build_object(''fields'',
                     COALESCE(extraction_metadata -> ''fields'', ''{}''::jsonb)),
              ARRAY[''fields'', $2],
              COALESCE(extraction_metadata #> ARRAY[''fields'', $2], ''{}''::jsonb)
                || jsonb_build_object(
                     ''final_value'', COALESCE($1, %I),
                     ''edited'', ($1 IS NOT NULL),
                     ''reviewed'', false,
                     ''reviewed_by'', NULL,
                     ''reviewed_by_name'', NULL,
                     ''reviewed_at'', NULL,
                     ''previous_review'', jsonb_build_object(
                       ''reviewed_by'', extraction_metadata #>> ARRAY[''fields'', $2, ''reviewed_by''],
                       ''reviewed_by_name'', extraction_metadata #>> ARRAY[''fields'', $2, ''reviewed_by_name''],
                       ''reviewed_at'', extraction_metadata #>> ARRAY[''fields'', $2, ''reviewed_at''],
                       ''withdrawn_by'', $3::text
                     )
                   ),
              true
            ),
            updated_by = $3
      WHERE id = $4
      RETURNING *',
    visa_contract_identity_column(p_field),
    visa_contract_identity_column(p_field),
    visa_contract_identity_column(p_field))
  INTO updated
  USING NULLIF(btrim(COALESCE(p_value, '')), ''), p_field, actor, p_record_id;

  IF updated.id IS NULL THEN
    RAISE EXCEPTION 'visa_contract_records: record not found'
      USING ERRCODE = 'no_data_found';
  END IF;
  RETURN updated;
END;
$$;

REVOKE EXECUTE ON FUNCTION visa_contract_review_field(uuid, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION visa_contract_review_field(uuid, text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION visa_contract_clear_field_review(uuid, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION visa_contract_clear_field_review(uuid, text, text) TO authenticated;

-- ============================================================
-- 6. Row level security
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
